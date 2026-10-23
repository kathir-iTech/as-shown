import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const alt =
  "As-Shown — Try on your next thrift find. Your secondhand fitting room powered by YouCam.";
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
        background: "#f7f5f0",
        color: "#191919",
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
          Try on your<span style={{ color: "#c53720" }}>next thrift find.</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 20,
            lineHeight: 1.5,
          }}
        >
          <span>Your photo. Your next find.</span>
          <span>See the look. Check the real details.</span>
          <span>Your own rack. Not a public shop.</span>
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
