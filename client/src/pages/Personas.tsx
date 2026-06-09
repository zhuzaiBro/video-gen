import { useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Tag,
  Empty,
  Card,
  Popconfirm,
  Spin,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface PersonaFormData {
  name: string;
  description?: string;
  personality?: string;
  voiceStyle?: string;
  backgroundStory?: string;
}

/**
 * Persona management page with Ant Design
 */
export default function Personas() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  // Fetch personas
  const { data: personas = [], isLoading, refetch } = trpc.personas.list.useQuery();

  // Mutations
  const createPersona = trpc.personas.create.useMutation({
    onSuccess: () => {
      toast.success("Persona created successfully");
      setIsModalOpen(false);
      form.resetFields();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create persona");
    },
  });

  const updatePersona = trpc.personas.update.useMutation({
    onSuccess: () => {
      toast.success("Persona updated successfully");
      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update persona");
    },
  });

  const deletePersona = trpc.personas.delete.useMutation({
    onSuccess: () => {
      toast.success("Persona deleted successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete persona");
    },
  });

  const handleOpenModal = (persona?: any) => {
    if (persona) {
      setEditingId(persona.id);
      form.setFieldsValue({
        name: persona.name,
        description: persona.description,
        personality: persona.personality,
        voiceStyle: persona.voiceStyle,
        backgroundStory: persona.backgroundStory,
      });
    } else {
      setEditingId(null);
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: PersonaFormData) => {
    if (editingId) {
      await updatePersona.mutateAsync({
        personaId: editingId,
        ...values,
      });
    } else {
      await createPersona.mutateAsync(values);
    }
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: "Personality",
      dataIndex: "personality",
      key: "personality",
      render: (text: string) => text || "-",
    },
    {
      title: "Voice Style",
      dataIndex: "voiceStyle",
      key: "voiceStyle",
      render: (text: string) => <Tag>{text || "Not set"}</Tag>,
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date: Date) => new Date(date).toLocaleDateString(),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: any, record: any) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete Persona"
            description="Are you sure you want to delete this persona?"
            onConfirm={() => deletePersona.mutate({ personaId: record.id })}
            okText="Yes"
            cancelText="No"
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={deletePersona.isPending}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Personas</h1>
          <p className="text-gray-600 mt-2">
            Create and manage your digital human personas
          </p>
        </div>
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          New Persona
        </Button>
      </div>

      {/* Personas Table */}
      <Card className="shadow-sm">
        <Spin spinning={isLoading}>
          {personas && personas.length > 0 ? (
            <Table
              columns={columns}
              dataSource={personas}
              rowKey="id"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} personas`,
              }}
            />
          ) : (
            <Empty
              description="No Personas Yet"
              style={{ marginTop: 50, marginBottom: 50 }}
            >
              <Button
                type="primary"
                onClick={() => handleOpenModal()}
                icon={<PlusOutlined />}
              >
                Create First Persona
              </Button>
            </Empty>
          )}
        </Spin>
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingId ? "Edit Persona" : "Create New Persona"}
        open={isModalOpen}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          setEditingId(null);
        }}
        width={600}
        okText={editingId ? "Update" : "Create"}
        confirmLoading={createPersona.isPending || updatePersona.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Please enter persona name" }]}
          >
            <Input placeholder="e.g., Emma Watson" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
            rules={[
              {
                required: true,
                message: "Please enter persona description",
              },
            ]}
          >
            <Input.TextArea
              placeholder="Describe the appearance, style, and characteristics..."
              rows={3}
            />
          </Form.Item>

          <Form.Item name="personality" label="Personality">
            <Input.TextArea
              placeholder="e.g., Friendly, professional, energetic..."
              rows={2}
            />
          </Form.Item>

          <Form.Item name="voiceStyle" label="Voice Style">
            <Input placeholder="e.g., Warm, clear, professional..." />
          </Form.Item>

          <Form.Item name="backgroundStory" label="Background Story">
            <Input.TextArea
              placeholder="Tell the story of your persona..."
              rows={2}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
