import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit2, Trash2, Image } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Personas management page
 */
export default function Personas() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    personality: "",
    voiceStyle: "",
    backgroundStory: "",
  });

  // Fetch personas
  const { data: personas = [], isLoading, refetch } = trpc.personas.list.useQuery();

  // Create persona mutation
  const createMutation = trpc.personas.create.useMutation({
    onSuccess: () => {
      toast.success("Persona created successfully");
      setFormData({
        name: "",
        description: "",
        personality: "",
        voiceStyle: "",
        backgroundStory: "",
      });
      setIsCreateOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create persona");
    },
  });

  // Update persona mutation
  const updateMutation = trpc.personas.update.useMutation({
    onSuccess: () => {
      toast.success("Persona updated successfully");
      setIsEditOpen(false);
      setSelectedPersona(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update persona");
    },
  });

  // Delete persona mutation
  const deleteMutation = trpc.personas.delete.useMutation({
    onSuccess: () => {
      toast.success("Persona deleted successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete persona");
    },
  });

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("Persona name is required");
      return;
    }

    await createMutation.mutateAsync(formData);
  };

  const handleUpdate = async () => {
    if (!selectedPersona) return;

    await updateMutation.mutateAsync({
      personaId: selectedPersona.id,
      ...formData,
    });
  };

  const handleDelete = async (personaId: number) => {
    if (confirm("Are you sure you want to delete this persona?")) {
      await deleteMutation.mutateAsync({ personaId });
    }
  };

  const openEditDialog = (persona: any) => {
    setSelectedPersona(persona);
    setFormData({
      name: persona.name,
      description: persona.description || "",
      personality: persona.personality || "",
      voiceStyle: persona.voiceStyle || "",
      backgroundStory: persona.backgroundStory || "",
    });
    setIsEditOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading personas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Digital Personas
            </h1>
            <p className="text-lg text-slate-600">
              Create and manage your digital human personas
            </p>
          </div>
          <Button
            onClick={() => {
              setFormData({
                name: "",
                description: "",
                personality: "",
                voiceStyle: "",
                backgroundStory: "",
              });
              setIsCreateOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Persona
          </Button>
        </div>

        {personas.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-slate-600 mb-4">No personas yet</p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create Your First Persona
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {personas.map((persona: any) => (
              <Card key={persona.id} className="p-6 hover:shadow-lg transition">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-bold text-slate-900">
                    {persona.name}
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(persona)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(persona.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {persona.description && (
                  <p className="text-sm text-slate-600 mb-2">
                    {persona.description.substring(0, 100)}...
                  </p>
                )}

                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      // Navigate to generate page with persona selected
                    }}
                  >
                    Generate Video
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Open reference images dialog
                    }}
                  >
                    <Image className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Persona</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Luna, Alex, etc."
                />
              </div>

              <div>
                <Label htmlFor="description">Physical Appearance</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe the persona's appearance..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="personality">Personality Traits</Label>
                <Textarea
                  id="personality"
                  value={formData.personality}
                  onChange={(e) =>
                    setFormData({ ...formData, personality: e.target.value })
                  }
                  placeholder="Describe personality characteristics..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="voiceStyle">Voice Style</Label>
                <Input
                  id="voiceStyle"
                  value={formData.voiceStyle}
                  onChange={(e) =>
                    setFormData({ ...formData, voiceStyle: e.target.value })
                  }
                  placeholder="e.g., Warm, Professional, Energetic"
                />
              </div>

              <div>
                <Label htmlFor="backgroundStory">Background Story</Label>
                <Textarea
                  id="backgroundStory"
                  value={formData.backgroundStory}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      backgroundStory: e.target.value,
                    })
                  }
                  placeholder="Tell the persona's background story..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Persona</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="edit-description">Physical Appearance</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="edit-personality">Personality Traits</Label>
                <Textarea
                  id="edit-personality"
                  value={formData.personality}
                  onChange={(e) =>
                    setFormData({ ...formData, personality: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="edit-voiceStyle">Voice Style</Label>
                <Input
                  id="edit-voiceStyle"
                  value={formData.voiceStyle}
                  onChange={(e) =>
                    setFormData({ ...formData, voiceStyle: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="edit-backgroundStory">Background Story</Label>
                <Textarea
                  id="edit-backgroundStory"
                  value={formData.backgroundStory}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      backgroundStory: e.target.value,
                    })
                  }
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {updateMutation.isPending ? "Updating..." : "Update"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
