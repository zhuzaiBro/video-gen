import { useState } from "react";
import {
  Card,
  Tabs,
  Form,
  Input,
  Button,
  Select,
  Slider,
  Space,
  Row,
  Col,
  Upload,
  message,
  Spin,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Video generation page with three modes using Ant Design
 */
export default function Generate() {
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState("prompt");

  // Prompt mode state
  const [promptInput, setPromptInput] = useState("");
  const [promptParams, setPromptParams] = useState({
    duration: 8,
    resolution: "720p" as "720p" | "1080p" | "4K",
    aspectRatio: "16:9" as "16:9" | "9:16",
  });

  // Reference image mode state
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [referencePrompt, setReferencePrompt] = useState("");

  // Persona mode state
  const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
  const [personaPrompt, setPersonaPrompt] = useState("");

  // Fetch personas
  const { data: personas = [] } = trpc.personas.list.useQuery();

  // Mutations
  const generateFromPrompt = trpc.videoGeneration.generateFromPrompt.useMutation({
    onSuccess: () => {
      toast.success("Video generation started!");
      setPromptInput("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate video");
    },
  });

  const generateFromReferenceImages =
    trpc.videoGeneration.generateFromReferenceImages.useMutation({
      onSuccess: () => {
        toast.success("Video generation started!");
        setReferencePrompt("");
        setReferenceImages([]);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to generate video");
      },
    });

  const generateFromPersona =
    trpc.videoGeneration.generateFromPersona.useMutation({
      onSuccess: () => {
        toast.success("Video generation started!");
        setPersonaPrompt("");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to generate video");
      },
    });

  const handleGenerateFromPrompt = async () => {
    if (!promptInput.trim()) {
      message.error("Please enter a prompt");
      return;
    }

    await generateFromPrompt.mutateAsync({
      prompt: promptInput,
      ...promptParams,
    });
  };

  const handleGenerateFromReferenceImages = async () => {
    if (!referencePrompt.trim()) {
      message.error("Please enter a prompt");
      return;
    }

    if (referenceImages.length === 0) {
      message.error("Please upload at least one reference image");
      return;
    }

    await generateFromReferenceImages.mutateAsync({
      prompt: referencePrompt,
      referenceImageUrls: referenceImages,
      duration: promptParams.duration,
      resolution: promptParams.resolution,
      aspectRatio: promptParams.aspectRatio,
    });
  };

  const handleGenerateFromPersona = async () => {
    if (!selectedPersonaId) {
      message.error("Please select a persona");
      return;
    }

    await generateFromPersona.mutateAsync({
      personaId: selectedPersonaId,
      userPrompt: personaPrompt,
      duration: promptParams.duration,
      resolution: promptParams.resolution,
      aspectRatio: promptParams.aspectRatio,
    });
  };

  const tabItems = [
    {
      key: "prompt",
      label: "📝 Prompt Mode",
      children: (
        <Card className="mt-4">
          <Form layout="vertical" className="space-y-4">
            <Form.Item
              label="Video Prompt"
              required
              tooltip="Describe the video you want to generate. Be specific about actions, emotions, and visual style."
            >
              <Input.TextArea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Describe the video you want to generate..."
                rows={6}
              />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label="Duration (seconds)">
                  <Slider
                    min={1}
                    max={8}
                    value={promptParams.duration}
                    onChange={(value) =>
                      setPromptParams({ ...promptParams, duration: value })
                    }
                    marks={{ 1: "1s", 4: "4s", 8: "8s" }}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={8}>
                <Form.Item label="Resolution">
                  <Select
                    value={promptParams.resolution}
                    onChange={(value) =>
                      setPromptParams({
                        ...promptParams,
                        resolution: value,
                      })
                    }
                    options={[
                      { label: "720p", value: "720p" },
                      { label: "1080p", value: "1080p" },
                      { label: "4K", value: "4K" },
                    ]}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={8}>
                <Form.Item label="Aspect Ratio">
                  <Select
                    value={promptParams.aspectRatio}
                    onChange={(value) =>
                      setPromptParams({
                        ...promptParams,
                        aspectRatio: value,
                      })
                    }
                    options={[
                      { label: "16:9 (Landscape)", value: "16:9" },
                      { label: "9:16 (Portrait)", value: "9:16" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Button
              type="primary"
              size="large"
              block
              icon={<PlayCircleOutlined />}
              loading={generateFromPrompt.isPending}
              onClick={handleGenerateFromPrompt}
              disabled={!promptInput.trim()}
            >
              Generate Video
            </Button>
          </Form>
        </Card>
      ),
    },
    {
      key: "reference",
      label: "🖼️ Reference Image Mode",
      children: (
        <Card className="mt-4">
          <Form layout="vertical" className="space-y-4">
            <Form.Item
              label="Reference Images (up to 3)"
              tooltip="Upload images to guide the video generation"
            >
              <Upload
                listType="picture-card"
                maxCount={3}
                beforeUpload={() => false}
              >
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              </Upload>
            </Form.Item>

            <Form.Item label="Video Prompt" required>
              <Input.TextArea
                value={referencePrompt}
                onChange={(e) => setReferencePrompt(e.target.value)}
                placeholder="Describe how the reference images should guide the video generation..."
                rows={6}
              />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label="Duration (seconds)">
                  <Slider
                    min={1}
                    max={8}
                    value={promptParams.duration}
                    onChange={(value) =>
                      setPromptParams({ ...promptParams, duration: value })
                    }
                    marks={{ 1: "1s", 4: "4s", 8: "8s" }}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={8}>
                <Form.Item label="Resolution">
                  <Select
                    value={promptParams.resolution}
                    onChange={(value) =>
                      setPromptParams({
                        ...promptParams,
                        resolution: value,
                      })
                    }
                    options={[
                      { label: "720p", value: "720p" },
                      { label: "1080p", value: "1080p" },
                      { label: "4K", value: "4K" },
                    ]}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={8}>
                <Form.Item label="Aspect Ratio">
                  <Select
                    value={promptParams.aspectRatio}
                    onChange={(value) =>
                      setPromptParams({
                        ...promptParams,
                        aspectRatio: value,
                      })
                    }
                    options={[
                      { label: "16:9 (Landscape)", value: "16:9" },
                      { label: "9:16 (Portrait)", value: "9:16" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Button
              type="primary"
              size="large"
              block
              icon={<PlayCircleOutlined />}
              loading={generateFromReferenceImages.isPending}
              onClick={handleGenerateFromReferenceImages}
              disabled={!referencePrompt.trim() || referenceImages.length === 0}
            >
              Generate Video
            </Button>
          </Form>
        </Card>
      ),
    },
    {
      key: "persona",
      label: "🤖 Persona Agent Mode",
      children: (
        <Card className="mt-4">
          <Form layout="vertical" className="space-y-4">
            <Form.Item label="Select Persona" required>
              <Select
                placeholder="Choose a persona..."
                value={selectedPersonaId}
                onChange={setSelectedPersonaId}
                options={personas.map((p: any) => ({
                  label: p.name,
                  value: p.id,
                }))}
              />
              {personas.length === 0 && (
                <p className="text-red-500 text-sm mt-2">
                  No personas available. Create one first.
                </p>
              )}
            </Form.Item>

            <Form.Item label="Additional Direction (Optional)">
              <Input.TextArea
                value={personaPrompt}
                onChange={(e) => setPersonaPrompt(e.target.value)}
                placeholder="Add any additional direction for the video. The AI will combine this with the persona's attributes..."
                rows={6}
              />
              <p className="text-gray-500 text-sm mt-2">
                The AI will automatically expand the persona's attributes into a detailed prompt.
              </p>
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label="Duration (seconds)">
                  <Slider
                    min={1}
                    max={8}
                    value={promptParams.duration}
                    onChange={(value) =>
                      setPromptParams({ ...promptParams, duration: value })
                    }
                    marks={{ 1: "1s", 4: "4s", 8: "8s" }}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={8}>
                <Form.Item label="Resolution">
                  <Select
                    value={promptParams.resolution}
                    onChange={(value) =>
                      setPromptParams({
                        ...promptParams,
                        resolution: value,
                      })
                    }
                    options={[
                      { label: "720p", value: "720p" },
                      { label: "1080p", value: "1080p" },
                      { label: "4K", value: "4K" },
                    ]}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={8}>
                <Form.Item label="Aspect Ratio">
                  <Select
                    value={promptParams.aspectRatio}
                    onChange={(value) =>
                      setPromptParams({
                        ...promptParams,
                        aspectRatio: value,
                      })
                    }
                    options={[
                      { label: "16:9 (Landscape)", value: "16:9" },
                      { label: "9:16 (Portrait)", value: "9:16" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Button
              type="primary"
              size="large"
              block
              icon={<PlayCircleOutlined />}
              loading={generateFromPersona.isPending}
              onClick={handleGenerateFromPersona}
              disabled={!selectedPersonaId}
            >
              Generate with Persona Agent
            </Button>
          </Form>
        </Card>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Generate Videos</h1>
        <p className="text-gray-600 mt-2">
          Choose a generation mode and create stunning videos with Gemini Veo 3.1
        </p>
      </div>

      <Card className="shadow-sm">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
        />
      </Card>
    </div>
  );
}
