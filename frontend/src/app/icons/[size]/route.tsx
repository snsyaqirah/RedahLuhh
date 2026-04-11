import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  { params }: { params: { size: string } }
) {
  const size = Math.min(Math.max(parseInt(params.size) || 192, 48), 512);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #0a0a0f 0%, #1a0a14 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: size * 0.2,
          position: "relative",
        }}
      >
        {/* Brand accent ring */}
        <div
          style={{
            position: "absolute",
            width: size * 0.82,
            height: size * 0.82,
            borderRadius: "50%",
            border: `${Math.max(2, size * 0.025)}px solid #e9456030`,
          }}
        />
        {/* Motorcycle emoji */}
        <div
          style={{
            fontSize: size * 0.52,
            lineHeight: 1,
            display: "flex",
          }}
        >
          🏍️
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
