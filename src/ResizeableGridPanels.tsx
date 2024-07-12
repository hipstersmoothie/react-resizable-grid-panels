"use client";

import React from "react";
import { MoveMoveEvent, useId, useMove } from "react-aria";
import { createMachine, assign, enqueueActions } from "xstate";
import { createActorContext } from "@xstate/react";
import invariant from "invariant";

type PixelUnit = `${number}px`;
type PercentUnit = `${number}%`;
type Unit = PixelUnit | PercentUnit;
type Orientation = "horizontal" | "vertical";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function parseUnit(unit: Unit): { type: "pixel" | "percent"; value: number } {
  if (unit.endsWith("px")) {
    return { type: "pixel", value: parseFloat(unit) };
  }

  if (unit.endsWith("%")) {
    return { type: "percent", value: parseFloat(unit) };
  }

  throw new Error(`Invalid unit: ${unit}`);
}

interface Rect {
  width: number;
  height: number;
}

interface Constraints {
  min?: Unit;
  max?: Unit;
}

interface PanelData extends Constraints {
  type: "panel";
  id: string;
}

interface ActivePanelData extends PanelData {
  currentValue: number | "1fr";
}

function isPanelData(value: Item): value is ActivePanelData {
  return value.type === "panel";
}

interface PanelHandleData {
  type: "handle";
  id: string;
  size: PixelUnit;
}

type Item = ActivePanelData | PanelHandleData;

function isPanelHandle(value: Item): value is PanelHandleData {
  return value.type === "handle";
}

interface RegisterPanelEvent {
  type: "registerPanel";
  data: Omit<PanelData, "type">;
}

interface UnregisterPanelEvent {
  type: "unregisterPanel";
  id: string;
}

interface RegisterPanelHandleEvent {
  type: "registerPanelHandle";
  data: Omit<PanelHandleData, "type">;
}

interface UnregisterPanelHandleEvent {
  type: "unregisterPanelHandle";
  id: string;
}

interface DragHandleEvent {
  type: "dragHandle";
  id: string;
  value: MoveMoveEvent;
}

interface SetSizeEvent {
  type: "setSize";
  size: Rect;
}

interface GroupMachineContext {
  /** The items in the group */
  items: Array<Item>;
  /** The available space in the group */
  size: number;
  /** The template for the grid */
  template: string;
  /** The orientation of the grid */
  orientation: Orientation;
}

type GroupMachineEvent =
  | RegisterPanelEvent
  | UnregisterPanelEvent
  | RegisterPanelHandleEvent
  | UnregisterPanelHandleEvent
  | DragHandleEvent
  | SetSizeEvent;

type EventForType<T extends GroupMachineEvent["type"]> =
  T extends "registerPanel"
    ? RegisterPanelEvent
    : T extends "unregisterPanel"
      ? UnregisterPanelEvent
      : T extends "registerPanelHandle"
        ? RegisterPanelHandleEvent
        : T extends "unregisterPanelHandle"
          ? UnregisterPanelHandleEvent
          : T extends "dragHandle"
            ? DragHandleEvent
            : T extends "setSize"
              ? SetSizeEvent
              : never;

function isEvent<T extends GroupMachineEvent["type"]>(
  event: GroupMachineEvent,
  eventType: T[]
): asserts event is EventForType<T> {
  invariant(
    eventType.includes(event.type as T),
    `Invalid event type: ${eventType}. Expected: ${eventType.join(" | ")}`
  );
}

function layoutGroup(context: GroupMachineContext) {
  // If there is no space, just return the items as is
  if (context.size === 0) {
    return context.items;
  }

  // const panels = context.items.filter(isPanelData);
  const templateItems = context.items;

  return templateItems as Array<Item>;
}

function clampUnit(
  context: GroupMachineContext,
  item: PanelData,
  value: number
) {
  const minUnit = parseUnit(item.min || "0px");
  const maxUnit = parseUnit(item.max || "100%");

  return clamp(
    value,
    minUnit.type === "pixel" ? minUnit.value : minUnit.value * context.size,
    maxUnit.type === "pixel" ? maxUnit.value : maxUnit.value * context.size
  );
}

function updateLayout(
  context: GroupMachineContext,
  dragEvent: DragHandleEvent
) {
  const handleIndex = context.items.findIndex(
    (item) => item.id === dragEvent.id
  );

  if (handleIndex === -1) {
    return context.items;
  }

  let availableSpace = context.size;
  availableSpace -= context.items
    .filter(isPanelHandle)
    .map((item) => parseUnit(item.size).value)
    .reduce((a, b) => a + b, 0);

  const handle = context.items[handleIndex] as PanelHandleData;
  const newItems = [...context.items];
  const itemsWithFractions = newItems
    .map((i, index) =>
      isPanelData(i) && typeof i.currentValue === "string" ? index : -1
    )
    .filter((i) => i !== -1);

  // If there are any items with fractions, distribute them evenly
  if (itemsWithFractions.length > 0) {
    let fractionSpace = availableSpace;
    let remaining = itemsWithFractions.length;

    for (const index of itemsWithFractions) {
      const item = newItems[index];

      if (!item || !isPanelData(item)) {
        continue;
      }

      const fractionUnit = clampUnit(context, item, fractionSpace / remaining);

      newItems[index] = {
        ...item,
        currentValue: fractionUnit,
      };
      fractionSpace -= fractionUnit;
      remaining--;
    }
  }

  const moveUnit =
    context.orientation === "horizontal"
      ? dragEvent.value.deltaX
      : dragEvent.value.deltaY;
  // TODO these need to take delta into accounte
  const directionModifier = moveUnit < 0 ? 1 : -1;
  console.log({ moveUnit, directionModifier });
  const panelBefore = newItems[handleIndex - directionModifier];
  const panelAfter = newItems[handleIndex + directionModifier];

  // Error if the handle is not in the correct position
  if (!panelBefore || !isPanelData(panelBefore)) {
    throw new Error(`Expected panel before: ${handle.id}`);
  }

  if (!panelAfter || !isPanelData(panelAfter)) {
    throw new Error(`Expected panel after: ${handle.id}`);
  }

  // Do nothing at the bounds
  if (!panelBefore && moveUnit < 0) {
    return newItems;
  }

  if (!panelAfter && moveUnit > 0) {
    return newItems;
  }

  console.log({ panelBefore, panelAfter });
  const panelBeforePreviousValue = panelBefore.currentValue as number;
  const panelBeforeNewValue = clampUnit(
    context,
    panelBefore,
    (panelBefore.currentValue as number) - moveUnit * -directionModifier
  );

  if (panelBeforePreviousValue === panelBeforeNewValue) {
    return context.items;
  }

  panelBefore.currentValue = panelBeforeNewValue;
  const applied = panelBeforePreviousValue - panelBeforeNewValue;
  panelAfter.currentValue = clampUnit(
    context,
    panelAfter,
    (panelAfter.currentValue as number) + applied
  );

  return newItems;
}

function buildTemplate(items: Array<Item>) {
  return items
    .map((item) => {
      if (item.type === "panel") {
        if (typeof item.currentValue === "number") {
          return `${item.currentValue}px`;
        } else {
          return item.currentValue;
        }
      }

      return item.size;
    })
    .join(" ");
}

const groupMachine = createMachine(
  {
    types: {
      context: {} as GroupMachineContext,
      events: {} as GroupMachineEvent,
    },
    context: {
      size: 0,
      items: [],
      template: "",
      orientation: "horizontal",
    },
    on: {
      registerPanel: {
        actions: ["assignPanelData", "layout"],
      },
      unregisterPanel: {
        actions: ["removeItem", "layout"],
      },
      registerPanelHandle: {
        actions: ["assignPanelHandleData", "layout"],
      },
      unregisterPanelHandle: {
        actions: ["removeItem", "layout"],
      },
      dragHandle: {
        actions: ["onDragHandle"],
      },
      setSize: {
        actions: ["updateSize", "layout"],
      },
    },
  },
  {
    actions: {
      layout: enqueueActions(({ context, enqueue }) => {
        const items = layoutGroup(context);

        enqueue.assign({
          items,
          template: buildTemplate(items),
        });
      }),
      updateSize: assign({
        size: ({ context, event }) => {
          isEvent(event, ["setSize"]);

          return context.orientation === "horizontal"
            ? event.size.width
            : event.size.height;
        },
      }),
      assignPanelData: assign({
        items: ({ context, event }) => {
          isEvent(event, ["registerPanel"]);

          return [
            ...context.items,
            {
              type: "panel" as const,
              ...event.data,
              currentValue: "1fr" as const,
            },
          ];
        },
      }),
      assignPanelHandleData: assign({
        items: ({ context, event }) => {
          isEvent(event, ["registerPanelHandle"]);
          return [...context.items, { type: "handle" as const, ...event.data }];
        },
      }),
      removeItem: assign({
        items: ({ context, event }) => {
          isEvent(event, ["unregisterPanel", "unregisterPanelHandle"]);
          return context.items.filter((item) => item.id !== event.id);
        },
      }),
      onDragHandle: enqueueActions(({ context, event, enqueue }) => {
        isEvent(event, ["dragHandle"]);

        const items = updateLayout(context, event);

        enqueue.assign({
          items,
          template: buildTemplate(items),
        });
      }),
    },
  }
);

const GroupMachineContext = createActorContext(groupMachine);

function useDebugGroupMachineContext() {
  const context = GroupMachineContext.useSelector((state) => state.context);
  console.log("GROUP CONTEXT", context);
}

export interface PanelGroupProps {
  children: React.ReactNode;
  orientation?: Orientation;
}

export function PanelGroup({
  children,
  orientation = "horizontal",
}: PanelGroupProps) {
  return (
    <GroupMachineContext.Provider options={{ input: { orientation } }}>
      <PanelGroupImplementation>{children}</PanelGroupImplementation>
    </GroupMachineContext.Provider>
  );
}

function PanelGroupImplementation({ children }: PanelGroupProps) {
  const { send } = GroupMachineContext.useActorRef();

  useDebugGroupMachineContext();

  const groupId = `panel-group-${useId()}`;
  const orientation = GroupMachineContext.useSelector(
    (state) => state.context.orientation
  );
  const template = GroupMachineContext.useSelector(
    (state) => state.context.template
  );
  const size = GroupMachineContext.useSelector((state) => state.context.size);

  console.log({ template });
  const ref = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      send({ type: "setSize", size: entry.contentRect });
    });

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [send, ref]);

  return (
    <div
      ref={ref}
      data-group-id={groupId}
      style={{
        display: "grid",
        opacity: size === 0 ? 0 : 1,
        gridTemplateColumns:
          orientation === "horizontal" ? template : undefined,
        gridTemplateRows: orientation === "vertical" ? template : undefined,
      }}
    >
      {children}
    </div>
  );
}

export interface PanelProps extends Constraints {
  children: React.ReactNode;
}

export function Panel({ children, min, max }: PanelProps) {
  const panelId = `panel-${useId()}`;
  const { send } = GroupMachineContext.useActorRef();

  const hasRegistered = React.useRef(false);

  if (!hasRegistered.current) {
    hasRegistered.current = true;
    send({ type: "registerPanel", data: { min, max, id: panelId } });
  }

  React.useEffect(() => {
    return () => send({ type: "unregisterPanel", id: panelId });
  }, [send, panelId]);

  return (
    <div data-panel-id={panelId}>
      {panelId}
      {children}
    </div>
  );
}

export interface PanelResizerProps {
  size?: PixelUnit;
}

export function PanelResizer({ size = "10px" }: PanelResizerProps) {
  const handleId = `panel-resizer-${useId()}`;
  const { send } = GroupMachineContext.useActorRef();
  const { moveProps } = useMove({
    onMove: (e) => {
      send({ type: "dragHandle", id: handleId, value: e });
    },
  });

  const hasRegistered = React.useRef(false);

  if (!hasRegistered.current) {
    hasRegistered.current = true;
    send({ type: "registerPanelHandle", data: { id: handleId, size } });
  }

  React.useEffect(() => {
    return () => send({ type: "unregisterPanelHandle", id: handleId });
  }, [send, handleId]);

  return (
    <div
      data-handle-id={handleId}
      style={{ background: "red", width: 10, height: "100%" }}
      {...moveProps}
    />
  );
}
