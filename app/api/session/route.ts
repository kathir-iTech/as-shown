import { sessionResponse, safeError } from "@/provider/youcam";
export async function POST(request: Request) {
  try {
    return sessionResponse(request);
  } catch (error) {
    return safeError(error);
  }
}
