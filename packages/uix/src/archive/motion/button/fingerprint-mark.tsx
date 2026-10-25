const PATHS = [
  "M5.987,0c-1.441,0 -2.882,0.374 -4.173,1.119c-0.092,0.044 -0.151,0.137 -0.151,0.239c0,0.145 0.119,0.264 0.265,0.264c0.053,0 0.105,-0.016 0.149,-0.046c2.42,-1.397 5.401,-1.397 7.82,0c0.045,0.03 0.097,0.046 0.15,0.046c0.145,0 0.265,-0.119 0.265,-0.264c-0,-0.102 -0.059,-0.195 -0.151,-0.239c-1.291,-0.745 -2.732,-1.119 -4.174,-1.119Z",
  "M5.987,1.797c-2.137,-0 -4.275,0.816 -5.904,2.445c-0.053,0.05 -0.083,0.12 -0.083,0.193c-0,0.145 0.119,0.264 0.265,0.264c0.073,0 0.143,-0.03 0.193,-0.084c3.056,-3.056 8.003,-3.056 11.059,0c0.05,0.059 0.124,0.093 0.201,0.093c0.145,0 0.265,-0.119 0.265,-0.265c-0,-0.077 -0.034,-0.151 -0.093,-0.201c-1.629,-1.629 -3.766,-2.445 -5.903,-2.445Z",
  "M6.747,3.49c-0.712,-0.099 -1.454,-0.061 -2.191,0.137c-2.95,0.79 -4.705,3.828 -3.914,6.777c0.03,0.116 0.136,0.197 0.255,0.197c0.146,-0 0.265,-0.12 0.265,-0.265c0,-0.023 -0.003,-0.046 -0.009,-0.068c-0.716,-2.673 0.866,-5.413 3.539,-6.129c2.673,-0.717 5.413,0.866 6.129,3.539c0.031,0.115 0.137,0.196 0.256,0.196c0.145,0 0.265,-0.119 0.265,-0.265c0,-0.023 -0.003,-0.046 -0.009,-0.068c-0.593,-2.212 -2.45,-3.753 -4.586,-4.051Z",
  "M5.833,7.135c-1.027,0.142 -1.975,1.039 -1.977,2.636c0,0.001 0,0.003 0,0.004c-0.015,0.882 0.199,1.851 0.877,2.698c0.68,0.848 1.811,1.558 3.577,1.965c0.02,0.004 0.04,0.007 0.061,0.007c0.145,-0 0.265,-0.12 0.265,-0.265c-0,-0.123 -0.087,-0.231 -0.207,-0.258c-1.683,-0.387 -2.691,-1.042 -3.282,-1.779c-0.59,-0.738 -0.776,-1.57 -0.761,-2.362l-0,-0.006c-0,-1.403 0.733,-2.007 1.521,-2.117c0.788,-0.109 1.626,0.314 1.858,1.178l0.002,0.004l-0,0.006c0.481,1.566 1.671,2.32 2.658,2.076c0.493,-0.122 0.907,-0.512 1.086,-1.096c0.179,-0.583 0.144,-1.351 -0.184,-2.302c-0.033,-0.113 -0.137,-0.19 -0.254,-0.19c-0.145,-0 -0.264,0.119 -0.264,0.265c-0,0.033 0.006,0.066 0.018,0.096c0.303,0.879 0.312,1.54 0.178,1.977c-0.134,0.437 -0.392,0.658 -0.707,0.736c-0.63,0.156 -1.601,-0.338 -2.025,-1.718l0.003,0.01c-0.303,-1.133 -1.415,-1.708 -2.443,-1.565Z",
  "M5.757,5.404c-0.574,0.089 -1.135,0.298 -1.639,0.61c-1.007,0.623 -1.793,1.668 -1.965,2.994c-0.171,1.326 0.273,2.912 1.643,4.607c0.05,0.063 0.126,0.099 0.206,0.099c0.145,-0 0.265,-0.12 0.265,-0.265c-0,-0.06 -0.021,-0.119 -0.059,-0.166c-1.304,-1.614 -1.679,-3.048 -1.529,-4.207c0.15,-1.158 0.828,-2.064 1.717,-2.613c0.888,-0.549 1.979,-0.729 2.919,-0.442c0.941,0.288 1.751,1.024 2.122,2.407c0.023,0.124 0.133,0.215 0.259,0.215c0.146,-0 0.265,-0.12 0.265,-0.265c0,-0.029 -0.005,-0.059 -0.015,-0.087c-0.409,-1.528 -1.369,-2.437 -2.476,-2.775c-0.554,-0.17 -1.139,-0.201 -1.713,-0.112Z",
  "M5.987,9.148c0,0 0,0 0,0c-0.145,0 -0.265,0.12 -0.265,0.265c0,0.017 0.002,0.035 0.006,0.052c0.278,1.529 1.139,2.475 2.162,2.969c1.023,0.494 2.194,0.558 3.162,0.42c0.135,-0.013 0.239,-0.128 0.239,-0.264c0,-0.145 -0.119,-0.264 -0.264,-0.264c-0.017,-0 -0.033,0.001 -0.049,0.004c-0.885,0.126 -1.963,0.059 -2.858,-0.373c-0.895,-0.432 -1.622,-1.204 -1.873,-2.586c-0.02,-0.127 -0.131,-0.222 -0.26,-0.223l0,0Z",
] as const;

type FingerprintMarkProps = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  size: number;
  maskAngle: number;
  pressureX: number;
  pressureY: number;
};

export function FingerprintMark({
  id,
  x,
  y,
  width,
  height,
  rotation,
  size,
  maskAngle,
  pressureX,
  pressureY,
}: FingerprintMarkProps) {
  const pressureMaskId = `fingerprint-pressure-${id}`;
  const textureMaskId = `fingerprint-texture-${id}`;
  const glossId = `fingerprint-gloss-${id}`;
  const glossEndX = x < width / 2 ? width * 0.82 : width * 0.18;

  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 size-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <radialGradient
            cx={x}
            cy={y}
            gradientUnits="userSpaceOnUse"
            id={glossId}
            r={Math.max(width, height) * 0.7}
          >
            <stop offset="0" stopColor="white" stopOpacity="0.34" />
            <stop offset="0.2" stopColor="white" stopOpacity="0.13" />
            <stop offset="0.52" stopColor="white" stopOpacity="0.045" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
            <animate
              attributeName="cx"
              dur="360ms"
              fill="freeze"
              values={`${x};${glossEndX}`}
            />
            <animate
              attributeName="cy"
              dur="360ms"
              fill="freeze"
              values={`${y};${height * 0.18}`}
            />
          </radialGradient>
        </defs>
        <rect fill={`url(#${glossId})`} height={height} opacity="0" width={width}>
          <animate
            attributeName="opacity"
            dur="360ms"
            fill="freeze"
            keyTimes="0;0.16;0.58;1"
            values="0;0.22;0.07;0"
          />
        </rect>
      </svg>

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute z-10 overflow-visible"
        height={size}
        viewBox="0 0 12 15"
        width={size * 0.8}
        style={{
          left: x,
          top: y,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        }}
      >
        <defs>
          <radialGradient id={`${pressureMaskId}-gradient`} cx={pressureX} cy={pressureY} r="72%">
            <stop offset="0" stopColor="white" />
            <stop offset="0.38" stopColor="white" stopOpacity="0.88" />
            <stop offset="0.7" stopColor="white" stopOpacity="0.42" />
            <stop offset="1" stopColor="white" stopOpacity="0.04" />
          </radialGradient>
          <linearGradient
            gradientTransform={`rotate(${maskAngle} 0.5 0.5)`}
            id={`${textureMaskId}-gradient`}
          >
            <stop offset="0" stopColor="white" stopOpacity="0.18" />
            <stop offset="0.2" stopColor="white" stopOpacity="0.72" />
            <stop offset="0.43" stopColor="white" stopOpacity="0.96" />
            <stop offset="0.61" stopColor="white" stopOpacity="0.48" />
            <stop offset="0.81" stopColor="white" stopOpacity="0.76" />
            <stop offset="1" stopColor="white" stopOpacity="0.12" />
          </linearGradient>
          <mask id={pressureMaskId} maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill={`url(#${pressureMaskId}-gradient)`} />
          </mask>
          <mask id={textureMaskId} maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill={`url(#${textureMaskId}-gradient)`} />
          </mask>
        </defs>
        <g mask={`url(#${pressureMaskId})`}>
          <g
            fill="#f4f4f5"
            mask={`url(#${textureMaskId})`}
            opacity="0"
            style={{
              fill: "oklch(from var(--fingerprint-surface) clamp(0.82, calc(2.7 - 2 * l), 1) 0 h)",
            }}
          >
            {PATHS.map((path) => (
              <path d={path} key={path} />
            ))}
            <animate
              attributeName="opacity"
              begin="0s"
              dur="800ms"
              fill="freeze"
              keyTimes="0;0.15;0.62;1"
              values="0;0.58;0.3;0"
            />
          </g>
        </g>
      </svg>
    </>
  );
}
