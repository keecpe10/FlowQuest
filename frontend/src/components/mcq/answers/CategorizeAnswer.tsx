import React from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import CategorizeItemContent from '../CategorizeItemContent';

interface CategorizeItem { text: string; imageUrl?: string }

// Students receive strings with optional item_images; teacher previews receive item objects.
// Keep the item text as the drag ID because grading uses it as the answer key.
function getCategorizeOptions(metadata: unknown): { categories: string[]; items: CategorizeItem[] } {
    const data = metadata && typeof metadata === 'object'
        ? metadata as Record<string, unknown> : {};
    const categories = Array.isArray(data.categories)
        ? data.categories.filter((category): category is string => typeof category === 'string' && category.trim().length > 0)
        : [];
    const images = data.item_images && typeof data.item_images === 'object'
        ? data.item_images as Record<string, unknown> : {};
    const items: CategorizeItem[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(data.items) ? data.items : []) {
        const text = typeof item === 'string' ? item : item?.text;
        if (typeof text !== 'string' || !text.trim() || seen.has(text)) continue;
        const imageUrl = typeof item === 'object' ? item.image_url : images[text];
        items.push({ text, imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined });
        seen.add(text);
    }
    return { categories: [...new Set(categories)], items };
}

// Draggable Item Component
const DraggableItem = ({ id, content, imageUrl, disabled }: { id: string, content: string, imageUrl?: string, disabled?: boolean }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id,
        disabled,
    });
    
    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 999,
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={`p-3 bg-slate-800 text-white border border-slate-700 rounded-xl text-center text-sm font-semibold shadow-lg touch-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:bg-slate-700 hover:border-violet-500 transition-colors'}`}>
            <CategorizeItemContent text={content} imageUrl={imageUrl} />
        </div>
    );
};

// Droppable Zone Component
const CategoryDropZone = ({ id, title, children }: { id: string, title?: string, children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({ id });
    
    return (
        <div ref={setNodeRef} className={`p-4 rounded-2xl min-h-[120px] border-2 transition-all flex flex-col ${isOver ? 'border-violet-400 bg-violet-400/20' : 'border-white/10 bg-white/5'} ${!title && 'border-dashed border-slate-500 bg-transparent'}`}>
            {title && <h4 className="text-white font-bold mb-3 text-center border-b border-white/10 pb-2">{title}</h4>}
            <div className="flex flex-wrap gap-2 flex-1 items-start content-start">
                {children}
            </div>
            {!title && React.Children.count(children) === 0 && (
                <div className="text-slate-500 text-sm w-full text-center py-4">ลากรายการทั้งหมดไปจัดหมวดหมู่ด้านบน</div>
            )}
        </div>
    );
};

interface CategorizeAnswerProps {
    metadata: unknown;
    value: unknown;
    disabled?: boolean;
    onDragEnd: (event: DragEndEvent) => void;
}

export default function CategorizeAnswer({ metadata, value, disabled, onDragEnd }: CategorizeAnswerProps) {
    const { categories, items } = getCategorizeOptions(metadata);
    const answers = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : {};
    const categoryFor = (item: string) => Object.hasOwn(answers, item) ? answers[item] : undefined;

    return (
        <DndContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {categories.map(cat => (
                    <CategoryDropZone key={cat} id={cat} title={cat}>
                        {items.filter(item => categoryFor(item.text) === cat).map(item => (
                            <DraggableItem key={item.text} id={item.text} content={item.text} imageUrl={item.imageUrl} disabled={disabled} />
                        ))}
                    </CategoryDropZone>
                ))}
            </div>
            <div className="pt-6 border-t border-white/10">
                <CategoryDropZone id="uncategorized">
                    {items.filter(item => !categories.includes(categoryFor(item.text) as string)).map(item => (
                        <DraggableItem key={item.text} id={item.text} content={item.text} imageUrl={item.imageUrl} disabled={disabled} />
                    ))}
                </CategoryDropZone>
            </div>
        </DndContext>
    );
}
