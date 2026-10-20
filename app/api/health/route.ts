import { capability, json } from "@/provider/youcam";
export function GET() {
  return json(capability());
}
