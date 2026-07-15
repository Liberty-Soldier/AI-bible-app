type EmetseesLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

export default function EmetseesLogo({
  size = 36,
  className = "",
  title,
}: EmetseesLogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="17"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M18 17v30M32 13v38M46 17v30"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M44 21c-4.5-5-20-5-22 3.5-2.1 8.7 18 6.5 18 14.2 0 7.1-13.7 9.4-20 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
