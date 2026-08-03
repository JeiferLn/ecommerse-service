"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface GalleryImageItem {
  id: string;
  src: string;
  alt: string;
}

interface ProductImagesSortableProps {
  images: GalleryImageItem[];
  canManage: boolean;
  disabled?: boolean;
  onReorder: (next: GalleryImageItem[]) => void;
  onRemove: (id: string) => void;
}

function ImageCard({
  image,
  index,
  isCover,
  canManage,
  disabled,
  onRemove,
  showControls,
  className,
  isDragging,
}: {
  image: GalleryImageItem;
  index: number;
  isCover: boolean;
  canManage: boolean;
  disabled?: boolean;
  onRemove: (id: string) => void;
  showControls?: boolean;
  className?: string;
  isDragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-xl border bg-muted",
        isDragging && "shadow-lg ring-2 ring-primary/40",
        className,
      )}
    >
      <div className="aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt={image.alt} className="h-full w-full object-contain" />
      </div>
      {isCover && (
        <span className="absolute left-2 top-2 rounded-md bg-background/90 px-2 py-0.5 text-xs font-medium shadow-sm">
          Portada
        </span>
      )}
      {canManage && showControls && (
        <>
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-xs text-muted-foreground shadow-sm">
            <GripVertical className="size-3.5" aria-hidden />
            Arrastrar
          </span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute right-2 top-2"
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(image.id);
            }}
          >
            <Trash2 aria-hidden />
          </Button>
        </>
      )}
    </div>
  );
}

function SortableImageCard({
  image,
  index,
  canManage,
  disabled,
  onRemove,
}: {
  image: GalleryImageItem;
  index: number;
  canManage: boolean;
  disabled?: boolean;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    disabled: !canManage || disabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 220ms cubic-bezier(0.25, 1, 0.5, 1)",
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "touch-none outline-none",
        canManage && !disabled && "cursor-grab active:cursor-grabbing",
      )}
      {...attributes}
      {...listeners}
    >
      <ImageCard
        image={image}
        index={index}
        isCover={index === 0}
        canManage={canManage}
        disabled={disabled}
        onRemove={onRemove}
        showControls
        isDragging={isDragging}
      />
    </div>
  );
}

export function ProductImagesSortable({
  images,
  canManage,
  disabled,
  onReorder,
  onRemove,
}: ProductImagesSortableProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<{ width: number; height: number } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeImage = activeId ? images.find((image) => image.id === activeId) : null;
  const activeIndex = activeId ? images.findIndex((image) => image.id === activeId) : -1;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    const rect = event.active.rect.current.initial;
    if (rect) {
      setActiveSize({ width: rect.width, height: rect.height });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveSize(null);
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = images.findIndex((image) => image.id === active.id);
    const newIndex = images.findIndex((image) => image.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    onReorder(arrayMove(images, oldIndex, newIndex));
  }

  function handleDragCancel() {
    setActiveId(null);
    setActiveSize(null);
  }

  if (images.length === 0) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={images.map((image) => image.id)} strategy={rectSortingStrategy}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {images.map((image, index) => (
            <SortableImageCard
              key={image.id}
              image={image}
              index={index}
              canManage={canManage}
              disabled={disabled}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay
        dropAnimation={{ duration: 220, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }}
        modifiers={[snapCenterToCursor]}
      >
        {activeImage ? (
          <div
            className="cursor-grabbing"
            style={
              activeSize
                ? { width: activeSize.width, height: activeSize.height }
                : { width: 220 }
            }
          >
            <ImageCard
              image={activeImage}
              index={Math.max(activeIndex, 0)}
              isCover={activeIndex === 0}
              canManage={false}
              onRemove={() => undefined}
              className="scale-[1.02] shadow-2xl ring-2 ring-primary/50"
              isDragging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
