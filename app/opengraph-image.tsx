import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const alt =
  "As-Shown — Try it on. Look closer. A secondhand decision studio powered by YouCam.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default async function Image() {
  const [preview, reference] = await Promise.all(
    ["preview", "reference"].map(
      async (name) =>
        "data:image/jpeg;base64," +
        (
          await readFile(join(process.cwd(), "public/samples/" + name + ".jpg"))
        ).toString("base64"),
    ),
  );
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#f3f2ec",
        color: "#263024",
        padding: 45,
        gap: 35,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 490,
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 30 }}>as-shown ✳</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 81,
            letterSpacing: -5,
            lineHeight: 1,
          }}
        >
          Try it on.<span style={{ color: "#6c765c" }}>Look closer.</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 20,
            lineHeight: 1.5,
          }}
        >
          <span>A YouCam style preview.</span>
          <span>Original condition photographs.</span>
          <span>Your decision, with its context.</span>
        </div>
        <div style={{ fontSize: 13 }}>
          SYNTHETIC DEMO / ACTUAL RECORDED YOUCAM OUTPUT
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, gap: 8 }}>
        <img
          src={preview}
          width={265}
          height={530}
          style={{ objectFit: "cover" }}
          alt=""
        />
        <img
          src={reference}
          width={265}
          height={530}
          style={{ objectFit: "cover" }}
          alt=""
        />
      </div>
    </div>,
    size,
  );
}
