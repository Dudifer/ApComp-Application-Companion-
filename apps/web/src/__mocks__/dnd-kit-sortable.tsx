import React from 'react';

export const SortableContext = ({ children }: { children: React.ReactNode }) => (
  <div>{children}</div>
);

export const verticalListSortingStrategy = {};
export const sortableKeyboardCoordinates = () => ({ x: 0, y: 0 });

export const useSortable = (args: { id: string }) => ({
  attributes: { 'data-id': args.id },
  listeners: {},
  setNodeRef: () => {},
  transform: null,
  transition: undefined,
  isDragging: false,
});
