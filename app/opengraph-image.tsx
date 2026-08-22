import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "EMETSEES — Bible Study & Scripture Evidence";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function Image() {
  const logo = await readFile(
    join(process.cwd(), "public", "brand", "emetsees-mark-gold.png"),
    "base64",
  );
  const logoSrc = `data:image/png;base64,${logo}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fffdf9",
          color: "#141414",
          padding: "64px 74px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div
            style={{
              width: "112px",
              height: "112px",
              borderRadius: "28px",
              background: "#f6ead2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={logoSrc}
              width={82}
              height={82}
              alt=""
              style={{ objectFit: "contain" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "58px",
                fontWeight: 900,
                letterSpacing: "0.08em",
              }}
            >
              EMETSEES
            </div>
            <div
              style={{
                marginTop: "8px",
                fontSize: "26px",
                fontWeight: 600,
                color: "#68645d",
              }}
            >
              Bible Study & Scripture Evidence
            </div>
          </div>
        </div>

        <div
          style={{
            maxWidth: "960px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: "54px",
              lineHeight: 1.08,
              fontWeight: 800,
              letterSpacing: "-0.025em",
            }}
          >
            Read Scripture. Trace the Evidence.
          </div>
          <div
            style={{
              marginTop: "22px",
              fontSize: "27px",
              lineHeight: 1.35,
              color: "#68645d",
            }}
          >
            Follow words from the English text into the source language and
            across Scripture itself.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "21px",
            fontWeight: 600,
            color: "#8a8378",
          }}
        >
          <span>emetsees.com</span>
          <span>Scripture evidence engine</span>
        </div>
      </div>
    ),
    size,
  );
}
