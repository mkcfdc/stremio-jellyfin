import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  useParams,
} from 'react-router-dom';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import MovieCard from './components/MovieCard.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnMount: false,
    },
  },
});

const RequestPage: React.FC = () => {
  const { tmdbId } = useParams<{ tmdbId: string }>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <MovieCard tmdbId={Number(tmdbId!)} />
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/request/:tmdbId" element={<RequestPage />} />
          <Route path="*" element={<div>Not found.</div>} />
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
