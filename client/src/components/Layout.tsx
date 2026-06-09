import { useState } from "react";
import { Layout, Menu, Button, Avatar, Dropdown, Space, Spin } from "antd";
import {
  HomeOutlined,
  UserOutlined,
  VideoCameraOutlined,
  HistoryOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

const { Header, Sider, Content } = Layout;

interface LayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [, navigate] = useLocation();
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen flex-col gap-4">
        <h1 className="text-4xl font-bold">Gemini Digital Human Agent</h1>
        <p className="text-lg text-gray-600">AI-Powered Video Generation Platform</p>
        <Button type="primary" size="large" href={getLoginUrl()}>
          Sign In with Manus
        </Button>
      </div>
    );
  }

  const menuItems = [
    {
      key: "/",
      icon: <HomeOutlined />,
      label: "Dashboard",
      onClick: () => navigate("/"),
    },
    {
      key: "/personas",
      icon: <UserOutlined />,
      label: "Personas",
      onClick: () => navigate("/personas"),
    },
    {
      key: "/generate",
      icon: <VideoCameraOutlined />,
      label: "Generate",
      onClick: () => navigate("/generate"),
    },
    {
      key: "/history",
      icon: <HistoryOutlined />,
      label: "History",
      onClick: () => navigate("/history"),
    },
  ];

  const userMenuItems = [
    {
      key: "profile",
      label: `${user.name || "User"}`,
      disabled: true,
    } as any,
    {
      type: "divider",
    } as any,
    {
      key: "logout",
      label: "Logout",
      icon: <LogoutOutlined />,
      onClick: async () => {
        await logout();
        toast.success("Logged out successfully");
        navigate("/");
      },
    } as any,
  ];

  return (
    <Layout className="min-h-screen">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={200}
        theme="dark"
        className="fixed left-0 top-0 bottom-0 overflow-y-auto"
      >
        <div className="p-4 text-center">
          <h1 className="text-white font-bold text-lg">
            {collapsed ? "GDH" : "Gemini DH"}
          </h1>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          items={menuItems}
          defaultSelectedKeys={["/"]}
        />
      </Sider>

      <Layout className={collapsed ? "ml-20" : "ml-48"} style={{ transition: "margin 0.2s" }}>
        <Header className="bg-white shadow-sm flex items-center justify-between px-6 sticky top-0 z-10">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            className="text-lg"
          />

          <Space size="large">
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div className="flex items-center gap-2 cursor-pointer hover:opacity-70">
                <Avatar
                  size="large"
                  icon={<UserOutlined />}
                  className="bg-blue-500"
                />
                <div className="hidden sm:block">
                  <div className="text-sm font-medium">{user.name || "User"}</div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </div>
              </div>
            </Dropdown>
          </Space>
        </Header>

        <Content className="p-6 bg-gray-50">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
