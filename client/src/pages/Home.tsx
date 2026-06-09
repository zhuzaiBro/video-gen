import { Card, Row, Col, Statistic, Button, Space, Tag, Empty } from "antd";
import {
  UserOutlined,
  VideoCameraOutlined,
  HistoryOutlined,
  ArrowRightOutlined,
  FileImageOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

/**
 * Dashboard home page with Ant Design
 */
export default function Home() {
  const [, navigate] = useLocation();

  // Fetch statistics
  const { data: personasCount = 0 } = trpc.personas.list.useQuery();
  const { data: videosData = [] } = trpc.history.listVideos.useQuery({
    limit: 100,
  });

  const stats = {
    personas: Array.isArray(personasCount) ? personasCount.length : 0,
    videos: Array.isArray(videosData) ? videosData.length : 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Welcome to Gemini Digital Human Agent - AI-Powered Video Generation Platform
        </p>
      </div>

      {/* Statistics */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Digital Personas"
              value={stats.personas}
              prefix={<UserOutlined />}
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Generated Videos"
              value={stats.videos}
              prefix={<VideoCameraOutlined />}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Generation Modes"
              value={3}
              prefix={<RobotOutlined />}
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Storage Used"
              value="0 GB"
              prefix={<FileImageOutlined />}
              valueStyle={{ color: "#f5222d" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Quick Actions */}
      <Card title="Quick Actions" className="shadow-sm">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Button
              type="primary"
              block
              size="large"
              icon={<UserOutlined />}
              onClick={() => navigate("/personas")}
            >
              Manage Personas
            </Button>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Button
              type="default"
              block
              size="large"
              icon={<VideoCameraOutlined />}
              onClick={() => navigate("/generate")}
            >
              Generate Video
            </Button>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Button
              type="default"
              block
              size="large"
              icon={<HistoryOutlined />}
              onClick={() => navigate("/history")}
            >
              View History
            </Button>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Button
              type="dashed"
              block
              size="large"
              onClick={() => navigate("/generate")}
            >
              Start Now
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Features Overview */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            hoverable
            className="cursor-pointer"
            onClick={() => navigate("/personas")}
          >
            <div className="text-center">
              <UserOutlined className="text-4xl text-blue-500 mb-4 block" />
              <h3 className="text-lg font-semibold mb-2">Persona Management</h3>
              <p className="text-gray-600 text-sm mb-4">
                Create and manage digital human personas with detailed attributes
              </p>
              <Button type="link" icon={<ArrowRightOutlined />}>
                Manage
              </Button>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            hoverable
            className="cursor-pointer"
            onClick={() => navigate("/generate")}
          >
            <div className="text-center">
              <VideoCameraOutlined className="text-4xl text-green-500 mb-4 block" />
              <h3 className="text-lg font-semibold mb-2">Video Generation</h3>
              <p className="text-gray-600 text-sm mb-4">
                Generate videos using prompts, reference images, or AI agents
              </p>
              <Button type="link" icon={<ArrowRightOutlined />}>
                Generate
              </Button>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            hoverable
            className="cursor-pointer"
            onClick={() => navigate("/history")}
          >
            <div className="text-center">
              <HistoryOutlined className="text-4xl text-orange-500 mb-4 block" />
              <h3 className="text-lg font-semibold mb-2">Video History</h3>
              <p className="text-gray-600 text-sm mb-4">
                Browse, manage, and download your generated videos
              </p>
              <Button type="link" icon={<ArrowRightOutlined />}>
                Browse
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Generation Modes */}
      <Card title="Three Generation Modes" className="shadow-sm">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card type="inner" className="bg-blue-50">
              <Tag color="blue" className="mb-3">
                Mode 1
              </Tag>
              <h4 className="font-semibold mb-2">Prompt-Based</h4>
              <p className="text-sm text-gray-600 mb-3">
                Input detailed prompts and let Gemini Veo 3.1 generate stunning videos with customizable parameters.
              </p>
              <Button type="primary" size="small" block>
                Try It
              </Button>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card type="inner" className="bg-green-50">
              <Tag color="green" className="mb-3">
                Mode 2
              </Tag>
              <h4 className="font-semibold mb-2">Reference Image</h4>
              <p className="text-sm text-gray-600 mb-3">
                Upload reference images and combine with prompts for style-consistent video generation.
              </p>
              <Button type="primary" size="small" block>
                Try It
              </Button>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card type="inner" className="bg-orange-50">
              <Tag color="orange" className="mb-3">
                Mode 3
              </Tag>
              <h4 className="font-semibold mb-2">Persona Agent</h4>
              <p className="text-sm text-gray-600 mb-3">
                Select a persona and let AI automatically expand attributes into detailed prompts.
              </p>
              <Button type="primary" size="small" block>
                Try It
              </Button>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* Getting Started */}
      <Card title="Getting Started" className="shadow-sm">
        <ol className="space-y-3 list-decimal list-inside">
          <li className="text-gray-700">
            <strong>Create a Persona</strong> - Go to Personas page and create your first digital human with custom attributes
          </li>
          <li className="text-gray-700">
            <strong>Choose Generation Mode</strong> - Select from prompt-based, reference image, or AI agent mode
          </li>
          <li className="text-gray-700">
            <strong>Configure Parameters</strong> - Set video duration, resolution, and aspect ratio
          </li>
          <li className="text-gray-700">
            <strong>Generate Video</strong> - Click generate and monitor progress in the History page
          </li>
          <li className="text-gray-700">
            <strong>Download & Share</strong> - Download your generated videos or share them directly
          </li>
        </ol>
      </Card>

      {/* Footer Info */}
      <div className="text-center text-gray-500 text-sm py-4">
        <p>Powered by Google Gemini Veo 3.1 | Supabase PostgreSQL | Tencent Cloud COS</p>
      </div>
    </div>
  );
}
