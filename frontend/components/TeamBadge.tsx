import { TEAM_STYLES } from "@/lib/constants";

interface Props {
  code: string;
  size?: "sm" | "md";
}

export default function TeamBadge({ code, size = "sm" }: Props) {
  const style = TEAM_STYLES[code] ?? {
    primary: "#6b7280",
    bg: "#6b728018",
    text: "#9ca3af",
  };

  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";

  return (
    <span
      className={`inline-flex items-center justify-center rounded font-bold shrink-0 ${dim}`}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.primary}50`,
      }}
    >
      {code}
    </span>
  );
}
