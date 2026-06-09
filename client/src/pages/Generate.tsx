import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Video generation page with three modes:
 * 1. Prompt-based generation
 * 2. Reference image-based generation
 * 3. Persona Agent generation
 */
export default function Generate() {
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
  const [referenceParams, setReferenceParams] = useState({
    duration: 8,
    resolution: "720p" as "720p" | "1080p" | "4K",
    aspectRatio: "16:9" as "16:9" | "9:16",
  });

  // Persona mode state
  const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [personaParams, setPersonaParams] = useState({
    duration: 8,
    resolution: "720p" as "720p" | "1080p" | "4K",
    aspectRatio: "16:9" as "16:9" | "9:16",
  });

  // Fetch personas for agent mode
  const { data: personas = [] } = trpc.personas.list.useQuery();

  // Mutations
  const generateFromPrompt = trpc.videoGeneration.generateFromPrompt.useMutation({
    onSuccess: (task) => {
      toast.success("Video generation started!");
      setPromptInput("");
      // Navigate to task detail or show task in queue
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate video");
    },
  });

  const generateFromReferenceImages =
    trpc.videoGeneration.generateFromReferenceImages.useMutation({
      onSuccess: (task) => {
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
      onSuccess: (task) => {
        toast.success("Video generation started!");
        setPersonaPrompt("");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to generate video");
      },
    });

  const handleGenerateFromPrompt = async () => {
    if (!promptInput.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    await generateFromPrompt.mutateAsync({
      prompt: promptInput,
      ...promptParams,
    });
  };

  const handleGenerateFromReferenceImages = async () => {
    if (!referencePrompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    if (referenceImages.length === 0) {
      toast.error("Please upload at least one reference image");
      return;
    }

    await generateFromReferenceImages.mutateAsync({
      prompt: referencePrompt,
      referenceImageUrls: referenceImages,
      ...referenceParams,
    });
  };

  const handleGenerateFromPersona = async () => {
    if (!selectedPersonaId) {
      toast.error("Please select a persona");
      return;
    }

    await generateFromPersona.mutateAsync({
      personaId: selectedPersonaId,
      userPrompt: personaPrompt,
      ...personaParams,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Generate Videos
          </h1>
          <p className="text-lg text-slate-600">
            Choose a generation mode and create stunning videos with Gemini Veo 3.1
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="reference">Reference</TabsTrigger>
            <TabsTrigger value="persona">Persona</TabsTrigger>
          </TabsList>

          {/* Prompt Mode */}
          <TabsContent value="prompt" className="mt-8">
            <Card className="p-8 max-w-2xl">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                Generate from Prompt
              </h2>

              <div className="space-y-6">
                <div>
                  <Label htmlFor="prompt">Video Prompt *</Label>
                  <Textarea
                    id="prompt"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder="Describe the video you want to generate. Be specific about actions, emotions, and visual style..."
                    rows={6}
                    className="mt-2"
                  />
                  <p className="text-sm text-slate-500 mt-2">
                    Minimum 10 characters. Be detailed for best results.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="duration">Duration (seconds)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min="1"
                      max="8"
                      value={promptParams.duration}
                      onChange={(e) =>
                        setPromptParams({
                          ...promptParams,
                          duration: parseInt(e.target.value),
                        })
                      }
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="resolution">Resolution</Label>
                    <Select
                      value={promptParams.resolution}
                      onValueChange={(value) =>
                        setPromptParams({
                          ...promptParams,
                          resolution: value as "720p" | "1080p" | "4K",
                        })
                      }
                    >
                      <SelectTrigger id="resolution" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                        <SelectItem value="4K">4K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="aspectRatio">Aspect Ratio</Label>
                    <Select
                      value={promptParams.aspectRatio}
                      onValueChange={(value) =>
                        setPromptParams({
                          ...promptParams,
                          aspectRatio: value as "16:9" | "9:16",
                        })
                      }
                    >
                      <SelectTrigger id="aspectRatio" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleGenerateFromPrompt}
                  disabled={generateFromPrompt.isPending || !promptInput.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 py-6 text-lg"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  {generateFromPrompt.isPending
                    ? "Generating..."
                    : "Generate Video"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Reference Image Mode */}
          <TabsContent value="reference" className="mt-8">
            <Card className="p-8 max-w-2xl">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                Generate from Reference Images
              </h2>

              <div className="space-y-6">
                <div>
                  <Label>Reference Images (up to 3)</Label>
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center mt-2">
                    <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600 mb-2">
                      Drag and drop images here or click to upload
                    </p>
                    <p className="text-sm text-slate-500">
                      PNG, JPG up to 10MB. Upload up to 3 images.
                    </p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="refPrompt">Video Prompt *</Label>
                  <Textarea
                    id="refPrompt"
                    value={referencePrompt}
                    onChange={(e) => setReferencePrompt(e.target.value)}
                    placeholder="Describe how the reference images should guide the video generation..."
                    rows={6}
                    className="mt-2"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="refDuration">Duration (seconds)</Label>
                    <Input
                      id="refDuration"
                      type="number"
                      min="1"
                      max="8"
                      value={referenceParams.duration}
                      onChange={(e) =>
                        setReferenceParams({
                          ...referenceParams,
                          duration: parseInt(e.target.value),
                        })
                      }
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="refResolution">Resolution</Label>
                    <Select
                      value={referenceParams.resolution}
                      onValueChange={(value) =>
                        setReferenceParams({
                          ...referenceParams,
                          resolution: value as "720p" | "1080p" | "4K",
                        })
                      }
                    >
                      <SelectTrigger id="refResolution" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                        <SelectItem value="4K">4K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="refAspectRatio">Aspect Ratio</Label>
                    <Select
                      value={referenceParams.aspectRatio}
                      onValueChange={(value) =>
                        setReferenceParams({
                          ...referenceParams,
                          aspectRatio: value as "16:9" | "9:16",
                        })
                      }
                    >
                      <SelectTrigger id="refAspectRatio" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleGenerateFromReferenceImages}
                  disabled={
                    generateFromReferenceImages.isPending ||
                    !referencePrompt.trim() ||
                    referenceImages.length === 0
                  }
                  className="w-full bg-purple-600 hover:bg-purple-700 py-6 text-lg"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  {generateFromReferenceImages.isPending
                    ? "Generating..."
                    : "Generate Video"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Persona Agent Mode */}
          <TabsContent value="persona" className="mt-8">
            <Card className="p-8 max-w-2xl">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                Generate from Persona (Agent Mode)
              </h2>

              <div className="space-y-6">
                <div>
                  <Label htmlFor="persona">Select Persona *</Label>
                  <Select
                    value={selectedPersonaId?.toString() || ""}
                    onValueChange={(value) =>
                      setSelectedPersonaId(parseInt(value))
                    }
                  >
                    <SelectTrigger id="persona" className="mt-2">
                      <SelectValue placeholder="Choose a persona..." />
                    </SelectTrigger>
                    <SelectContent>
                      {personas.map((persona: any) => (
                        <SelectItem key={persona.id} value={persona.id.toString()}>
                          {persona.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {personas.length === 0 && (
                    <p className="text-sm text-slate-500 mt-2">
                      No personas available. Create one first.
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="personaPrompt">Additional Direction (Optional)</Label>
                  <Textarea
                    id="personaPrompt"
                    value={personaPrompt}
                    onChange={(e) => setPersonaPrompt(e.target.value)}
                    placeholder="Add any additional direction for the video. The AI will combine this with the persona's attributes..."
                    rows={6}
                    className="mt-2"
                  />
                  <p className="text-sm text-slate-500 mt-2">
                    The AI will automatically expand the persona's attributes into a detailed prompt.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="personaDuration">Duration (seconds)</Label>
                    <Input
                      id="personaDuration"
                      type="number"
                      min="1"
                      max="8"
                      value={personaParams.duration}
                      onChange={(e) =>
                        setPersonaParams({
                          ...personaParams,
                          duration: parseInt(e.target.value),
                        })
                      }
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="personaResolution">Resolution</Label>
                    <Select
                      value={personaParams.resolution}
                      onValueChange={(value) =>
                        setPersonaParams({
                          ...personaParams,
                          resolution: value as "720p" | "1080p" | "4K",
                        })
                      }
                    >
                      <SelectTrigger id="personaResolution" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                        <SelectItem value="4K">4K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="personaAspectRatio">Aspect Ratio</Label>
                    <Select
                      value={personaParams.aspectRatio}
                      onValueChange={(value) =>
                        setPersonaParams({
                          ...personaParams,
                          aspectRatio: value as "16:9" | "9:16",
                        })
                      }
                    >
                      <SelectTrigger id="personaAspectRatio" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleGenerateFromPersona}
                  disabled={generateFromPersona.isPending || !selectedPersonaId}
                  className="w-full bg-green-600 hover:bg-green-700 py-6 text-lg"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  {generateFromPersona.isPending
                    ? "Generating..."
                    : "Generate with Persona Agent"}
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
