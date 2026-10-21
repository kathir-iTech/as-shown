import { capability, json } from "@/provider/youcam";
import { sharingConfigured } from "@/provider/sharing";
export function GET() {
  return json({ ...capability(), sharingEnabled: sharingConfigured() });
}
