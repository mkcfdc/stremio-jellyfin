import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Clock, RotateCw } from 'lucide-react';

interface MediaData {
  tmdb: number;
  mediaType: 'movie' | 'series';
  status: number | string;
  size: string;
  sizeLeft: string;
}

interface MediaResponse {
  id: number;
  media: MediaData;
  imdbId: string;
  posterPath: string;
}

interface MovieCardProps {
  tmdbId: number;
}

const statusMap: { [key: string]: { text: string; icon: React.ReactNode; color: string } } = {
  '0': { text: 'Unknown', icon: <Clock className="w-5 h-5" />, color: 'text-gray-400' },
  '1': { text: 'Queued', icon: <Clock className="w-5 h-5" />, color: 'text-yellow-400' },
  '2': { text: 'Downloading', icon: <RotateCw className="w-5 h-5 animate-spin" />, color: 'text-blue-400' },
  downloading: { text: 'Downloading', icon: <RotateCw className="w-5 h-5 animate-spin" />, color: 'text-blue-400' },
  '3': { text: 'Completed', icon: <CheckCircle className="w-5 h-5" />, color: 'text-green-400' },
  completed: { text: 'Moving files', icon: <RotateCw className="w-5 h-5 animate-spin" />, color: 'text-purple-400' },
  '5': { text: 'Available', icon: <CheckCircle className="w-5 h-5" />, color: 'text-green-400' },
};

const fetchMedia = async (tmdbId: number): Promise<MediaResponse> => {
  const res = await fetch(`/jellyseerr/request/${tmdbId}`);
  if (!res.ok) throw new Error('Network response was not ok');
  return (await res.json()) as MediaResponse;
};

const MovieCard: React.FC<MovieCardProps> = ({ tmdbId }) => {

const { data, isLoading, isError } = useQuery<MediaResponse>({
  queryKey: ['mediaStatus', tmdbId],
  queryFn: () => fetchMedia(tmdbId),
  refetchInterval: 5000, // Always poll
  enabled: true,         // Always enabled
  refetchOnWindowFocus: false,
});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 w-full max-w-md mx-auto">
        <RotateCw className="w-12 h-12 animate-spin text-purple-500" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-96 w-full max-w-md mx-auto text-red-500 font-semibold text-lg">
        Error loading media status
      </div>
    );
  }

  const { media, imdbId, posterPath } = data;
const rawStatus = typeof media.status === 'string' ? media.status.toLowerCase().trim() : String(media.status);
const { text: statusText, icon: statusIcon, color: statusColor } =
  statusMap[rawStatus] || statusMap['0'];

  const total = parseInt(media.size, 10);
  const left = parseInt(media.sizeLeft, 10);
  const progress = total > 0 ? Math.round(((total - left) / total) * 100) : 0;

return (
<div className="w-full max-w-md mx-auto bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-xl overflow-hidden transform transition-all hover:scale-[1.02] hover:shadow-2xl duration-300">
<div className="relative aspect-auto">
  <img
    src={posterPath}
    alt={`Poster for ${imdbId}`}
    className="w-full h-auto object-contain object-top transition-opacity duration-300 hover:opacity-90"
  />
  <div className="absolute top-4 right-4 bg-black bg-opacity-50 rounded-full px-3 py-1">
    <span className="text-xs font-medium text-white">
      {media.mediaType === 'movie' ? 'Movie' : 'Series'}
    </span>
  </div>
</div> 
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className={`flex items-center space-x-2 ${statusColor} font-medium`}>
            {statusIcon}
            <span className="text-sm">{statusText}</span>
          </span>
          <a
            href={`https://www.imdb.com/title/${imdbId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 text-sm font-medium transition-colors"
          >
            IMDb
          </a>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400">
          TMDB ID: {media.tmdb}
        </div>

        {(media.status === '2' || media.status === 'downloading') && (
          <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="absolute inset-0 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xs font-mono text-white drop-shadow-sm">
                {progress}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieCard;
