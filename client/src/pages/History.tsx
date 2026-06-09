import { useState } from "react";
import {
  Card,
  Row,
  Col,
  Select,
  Button,
  Space,
  Empty,
  Popconfirm,
  message,
  Spin,
  Tag,
  Pagination,
} from "antd";
import {
  DeleteOutlined,
  HeartOutlined,
  HeartFilled,
  DownloadOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Video history and management page with Ant Design
 */
export default function History() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Fetch personas for filter
  const { data: personas = [] } = trpc.personas.list.useQuery();

  // Fetch generated videos
  const { data: videos = [], isLoading, refetch } = trpc.history.listVideos.useQuery({
    personaId: selectedPersonaId ? parseInt(selectedPersonaId) : undefined,
    limit: 100,
    offset: (page - 1) * pageSize,
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
    deleteVideo.mutate({ videoId });
  };

  const displayVideos = Array.isArray(videos) ? videos.slice(0, pageSize) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Video History</h1>
        <p className="text-gray-600 mt-2">
          Browse and manage your generated videos
        </p>
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <Row gutter={16}>
          <Col xs={24} sm={12} md={8}>
            <Select
              placeholder="Filter by persona..."
              value={selectedPersonaId}
              onChange={setSelectedPersonaId}
              style={{ width: "100%" }}
              allowClear
              options={[
                { label: "All Personas", value: "" },
                ...personas.map((p: any) => ({
                  label: p.name,
                  value: p.id.toString(),
                })),
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Button block>Search Videos</Button>
          </Col>
        </Row>
      </Card>

      {/* Videos Grid */}
      <Spin spinning={isLoading}>
        {displayVideos.length === 0 ? (
          <Card>
            <Empty
              description="No videos yet"
              style={{ marginTop: 50, marginBottom: 50 }}
            >
              <Button type="primary" href="/generate">
                Generate Your First Video
              </Button>
            </Empty>
          </Card>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              {displayVideos.map((video: any) => (
                <Col key={video.id} xs={24} sm={12} lg={8}>
                  <Card
                    hoverable
                    className="h-full flex flex-col"
                    cover={
                      <div className="aspect-video bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center text-white">
                        <div className="text-center">
                          <div className="text-2xl mb-2">🎬</div>
                          <p className="text-sm">
                            {video.resolution} • {video.aspectRatio}
                          </p>
                          <p className="text-xs text-gray-300">
                            {video.duration || 8}s video
                          </p>
                        </div>
                      </div>
                    }
                  >
                    <div className="flex-1 flex flex-col">
                      <h3 className="font-semibold text-gray-900 mb-1 truncate">
                        {video.title || "Untitled Video"}
                      </h3>

                      {video.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {video.description}
                        </p>
                      )}

                      <div className="flex gap-2 flex-wrap mb-4">
                        <Tag>
                          {new Date(video.createdAt).toLocaleDateString()}
                        </Tag>
                      </div>

                      {/* Actions */}
                      <Space direction="vertical" style={{ width: "100%" }}>
                        <Button
                          block
                          icon={<DownloadOutlined />}
                          onClick={() => {
                            toast.info("Download feature coming soon");
                          }}
                        >
                          Download
                        </Button>

                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            icon={
                              video.isFavorite ? (
                                <HeartFilled className="text-red-500" />
                              ) : (
                                <HeartOutlined />
                              )
                            }
                            onClick={() =>
                              toggleFavorite.mutate({ videoId: video.id })
                            }
                          >
                            {video.isFavorite ? "Favorited" : "Favorite"}
                          </Button>

                          <Button
                            icon={<ShareAltOutlined />}
                            onClick={() => {
                              toast.info("Share feature coming soon");
                            }}
                          />

                          <Popconfirm
                            title="Delete Video"
                            description="Are you sure you want to delete this video?"
                            onConfirm={() => handleDelete(video.id)}
                            okText="Yes"
                            cancelText="No"
                          >
                            <Button
                              danger
                              icon={<DeleteOutlined />}
                              loading={deleteVideo.isPending}
                            />
                          </Popconfirm>
                        </div>
                      </Space>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>

            {/* Pagination */}
            {displayVideos.length > 0 && (
              <div className="flex justify-center mt-8">
                <Pagination
                  current={page}
                  pageSize={pageSize}
                  total={Array.isArray(videos) ? videos.length : 0}
                  onChange={setPage}
                  showSizeChanger={false}
                />
              </div>
            )}
          </>
        )}
      </Spin>
    </div>
  );
}
