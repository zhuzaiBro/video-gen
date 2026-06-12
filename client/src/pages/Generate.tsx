import GenerateConsole from "@/components/generate/GenerateConsole";
import { ComfyPage } from "@/components/comfy-ui";

export default function Generate() {
  return (
    <ComfyPage fullHeight className="p-0">
      <GenerateConsole />
    </ComfyPage>
  );
}
