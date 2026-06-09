import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Trash2, Heart, Share2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Video history and management page
 */
export default function History() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [page, setPage] = useState(0);

  // Fetch personas for filter
  const { data: personas = [] } = trpc.personas.list.useQuery();

  // Fetch generated videos
  const { data: videos = [], isLoading, refetch } = trpc.history.listVideos.useQuery({
    personaId: selectedPersonaId ? parseInt(selectedPersonaId) : undefined,
    limit: 50,
    offset: page * 50,
  });

  // Mutations
  const toggleFavorite = trpc.history.toggleFavorite.useMutation({
    onSuccess: () => {
      toast.success("Updated!");
      refetch();
    },
    onError: () => {
      toast.error("Failed to update");
    },
  });

  const deleteVideo = trpc.history.deleteVideo.useMutation({
    onSuccess: () => {
      toast.success("Video deleted");
      refetch();
    },
    onError: () => {
      toast.error("Failed to delete video");
    },
  });

  const handleDelete = (videoId: number) => {
    if (confirm("Are you sure you want to delete this video?")) {
      deleteVideo.mutate({ videoId });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading videos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Video History
          </h1>
          <p className="text-lg text-slate-600">
            Browse and manage your generated videos
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8 flex gap-4">
          <div className="w-64">
            <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by persona..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Personas</SelectItem>
                {personas.map((persona: any) => (
                  <SelectItem key={persona.id} value={persona.id.toString()}>
                    {persona.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Videos Grid */}
        {videos.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-slate-600 mb-4">No videos yet</p>
            <Button className="bg-blue-600 hover:bg-blue-700">
              Generate Your First Video
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video: any) => (
              <Card key={video.id} className="overflow-hidden hover:shadow-lg transition">
                {/* Video Thumbnail */}
                <div className="aspect-video bg-slate-900 relative group">
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition flex items-center justify-center">
                    <div className="text-white text-center">
                      <p className="text-sm font-semibold mb-2">
                        {video.resolution} • {video.aspectRatio}
                      </p>
                      <p className="text-xs text-slate-300">
                        {video.duration || 8}s video
                      </p>
                    </div>
                  </div>
                </div>

                {/* Video Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 mb-1 truncate">
                    {video.title || "Untitled Video"}
                  </h3>
                  {video.description && (
                    <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                      {video.description}
                    </p>
                  )}

                  <div className="flex gap-2 flex-wrap mb-4">
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                      {new Date(video.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        // Download video
                        toast.info("Download feature coming soon");
                      }}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFavorite.mutate({ videoId: video.id })}
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          video.isFavorite ? "fill-red-500 text-red-500" : ""
                        }`}
                      />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // Share video
                        toast.info("Share feature coming soon");
                      }}
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(video.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {videos.length > 0 && (
          <div className="flex justify-center gap-4 mt-12">
            <Button
              variant="outline"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={videos.length < 50}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
