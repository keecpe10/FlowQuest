import { resolveImageUrl } from './blocks';

/** Shared item appearance in draggable cards and answer reviews. */
export default function CategorizeItemContent({ text, imageUrl }: { text: string; imageUrl?: string }) {
    return (
        <span className="inline-flex max-w-full flex-col items-center gap-2 align-middle">
            {imageUrl && (
                <img src={resolveImageUrl(imageUrl)} alt={text} draggable={false}
                    className="h-24 w-24 rounded-lg bg-white object-contain pointer-events-none select-none" />
            )}
            <span className="break-words">{text}</span>
        </span>
    );
}
