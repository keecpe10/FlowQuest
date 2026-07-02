import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

interface LinkPreviewProps {
  url: string;
}

interface MicrolinkResponse {
  status: string;
  data: {
    title?: string;
    description?: string;
    image?: { url: string };
    url: string;
    logo?: { url: string };
  };
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
  const [data, setData] = useState<MicrolinkResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
        const json = await res.json();
        if (json.status === 'success') {
          setData(json.data);
        } else {
          setError(true);
        }
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 bg-black/5 rounded-xl border border-black/10 mt-3 h-32">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline mt-2 text-sm bg-blue-50 w-fit px-2 py-1 rounded-md" onClick={(e) => e.stopPropagation()}>
        <ExternalLink size={14} /> <span className="truncate max-w-[200px]">{url}</span>
      </a>
    );
  }

  return (
    <a 
      href={data.url || url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="block mt-3 rounded-xl overflow-hidden border border-black/10 bg-white hover:shadow-md transition-shadow group no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      {data.image?.url && (
        <div className="w-full h-32 overflow-hidden bg-gray-100 border-b border-black/5 relative">
          <img 
            src={data.image.url} 
            alt={data.title || 'Link preview'} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
      <div className="p-3">
        <h3 className="font-bold text-gray-800 text-sm line-clamp-1 mb-1 leading-tight">{data.title || url}</h3>
        {data.description && (
          <p className="text-gray-500 text-xs line-clamp-2 leading-relaxed">{data.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          {data.logo?.url ? (
            <img src={data.logo.url} alt="Logo" className="w-3 h-3 object-contain rounded-sm" />
          ) : (
            <ExternalLink size={12} className="text-gray-400" />
          )}
          <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider truncate">
            {new URL(data.url || url).hostname}
          </span>
        </div>
      </div>
    </a>
  );
};
