import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { Sparkles, Users, Video, History } from "lucide-react";

/**
 * Home page - main entry point for the application
 */
export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <div className="mb-8">
              <h1 className="text-5xl font-bold text-white mb-4">
                Gemini Digital Human Agent
              </h1>
              <p className="text-xl text-slate-300 mb-8">
                Create stunning digital human videos with AI-powered personas and Gemini Veo 3.1
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              <Card className="p-6 bg-slate-800 border-slate-700">
                <Users className="w-12 h-12 text-blue-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">
                  Persona Management
                </h3>
                <p className="text-slate-400">
                  Create and manage digital human personas with detailed attributes
                </p>
              </Card>

              <Card className="p-6 bg-slate-800 border-slate-700">
                <Video className="w-12 h-12 text-purple-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">
                  Video Generation
                </h3>
                <p className="text-slate-400">
                  Generate videos using prompts, reference images, or persona agents
                </p>
              </Card>

              <Card className="p-6 bg-slate-800 border-slate-700">
                <Sparkles className="w-12 h-12 text-yellow-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">
                  AI-Powered Expansion
                </h3>
                <p className="text-slate-400">
                  LLM automatically expands persona attributes into detailed prompts
                </p>
              </Card>

              <Card className="p-6 bg-slate-800 border-slate-700">
                <History className="w-12 h-12 text-green-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">
                  Video History
                </h3>
                <p className="text-slate-400">
                  Browse, manage, and download all your generated videos
                </p>
              </Card>
            </div>

            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg"
              onClick={() => {
                window.location.href = getLoginUrl();
              }}
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Welcome, {user?.name || "User"}!
          </h1>
          <p className="text-lg text-slate-600">
            Create and manage your digital human personas and videos
          </p>
        </div>

        <Tabs defaultValue="personas" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="personas">Personas</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="personas" className="mt-8">
            <Card className="p-8">
              <div className="text-center">
                <Users className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  Digital Personas
                </h2>
                <p className="text-slate-600 mb-6">
                  Create and manage your digital human personas
                </p>
                <Link href="/personas">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Manage Personas
                  </Button>
                </Link>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="generate" className="mt-8">
            <Card className="p-8">
              <div className="text-center">
                <Video className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  Generate Videos
                </h2>
                <p className="text-slate-600 mb-6">
                  Create videos using prompts, images, or personas
                </p>
                <Link href="/generate">
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    Start Generating
                  </Button>
                </Link>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-8">
            <Card className="p-8">
              <div className="text-center">
                <History className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  Video History
                </h2>
                <p className="text-slate-600 mb-6">
                  Browse and manage your generated videos
                </p>
                <Link href="/history">
                  <Button className="bg-green-600 hover:bg-green-700">
                    View History
                  </Button>
                </Link>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
