import React from 'react';

export const DndContext = ({ children }: { children: React.ReactNode }) => (
  <div>{children}</div>
);

export const closestCenter = () => null;
export const KeyboardSensor = class {};
export const PointerSensor = class {};
export const useSensor = () => ({});
export const useSensors = (...args: any[]) => args;
export type { DragEndEvent } from '@dnd-kit/core';
