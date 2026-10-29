// Adapted from ogimagecn Grid (MIT): https://github.com/shadcn-labs/ogimagecn
export interface GridProps {
  title: string;
  description: string;
  brand: string;
  logo?: string;
  /** Dojo.foo: the ground under it, e.g. the footer's contour map (public/og-ground.png), on its color */
  background?: string;
  backgroundColor?: string;
}

export const Grid = ({ title, description, brand, logo = "", background, backgroundColor = "#0a0a0a" }: GridProps) => (
  <div
    style={{
      backgroundColor,
      color: "#ffffff",
      display: "flex",
      height: "100%",
      position: "relative",
      width: "100%",
    }}
  >
    {background && <img alt="" src={background} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />}
    {/* Dojo.foo: a glass-like fade over the map, clearing it behind the words and letting it show to the right */}
    {background && <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(100deg, ${backgroundColor}b3 0%, ${backgroundColor}80 35%, ${backgroundColor}1a 65%, ${backgroundColor}00 100%)` }} />}
    <div
      style={{
        borderLeft: "1px dotted #44403c",
        bottom: 0,
        left: "64px",
        position: "absolute",
        top: 0,
        width: "1px",
      }}
    />
    <div
      style={{
        borderLeft: "1px dotted #44403c",
        bottom: 0,
        position: "absolute",
        right: "64px",
        top: 0,
        width: "1px",
      }}
    />
    <div
      style={{
        borderTop: "1px dotted #44403c",
        height: "1px",
        left: 0,
        position: "absolute",
        right: 0,
        top: "64px",
      }}
    />
    <div
      style={{
        borderTop: "1px dotted #44403c",
        bottom: "64px",
        height: "1px",
        left: 0,
        position: "absolute",
        right: 0,
      }}
    />

    <div
      style={{
        bottom: "128px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        left: "128px",
        position: "absolute",
        right: "128px",
        top: "128px",
        width: "896px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          fontSize: title && title.length > 20 ? 64 : 80,
          fontFamily: "Khand",
          fontWeight: 500,
          lineHeight: 1.1,
          textWrap: "balance",
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "#a8a29e",
          display: "flex",
          flexGrow: 1,
          fontSize: "40px",
          fontFamily: "Hind",
          fontWeight: 400,
          lineHeight: 1.5,
          marginTop: "24px",
          textWrap: "balance",
        }}
      >
        {description}
      </div>
    </div>

    <div
      style={{
        alignItems: "center",
        bottom: "96px",
        display: "flex",
        gap: "14px",
        position: "absolute",
        right: "96px",
      }}
    >
      {logo ? (
        <img
          alt=""
          height={48}
          src={logo}
          width={170}
          style={{
            borderRadius: "0px",
            objectFit: "contain",
          }}
        />
      ) : (
        <div
          style={{
            alignItems: "center",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            color: "#0a0a0a",
            display: "flex",
            fontSize: "26px",
            fontWeight: 800,
            height: "48px",
            justifyContent: "center",
            width: "48px",
          }}
        />
      )}
      <span
        style={{
          fontSize: "30px",
          fontWeight: 600,
        }}
      >
        {brand}
      </span>
    </div>
  </div>
);
