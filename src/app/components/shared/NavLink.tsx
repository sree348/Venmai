export default function NavLink({ icon, label, active, badge, count, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all border-0 cursor-pointer ${
        active
          ? "bg-gradient-primary text-white shadow-glow"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground bg-transparent"
      }`}
    >
      <span className={`flex-shrink-0 transition-colors ${active ? "text-white" : "text-muted-foreground group-hover:text-foreground"}`}>
        {icon}
      </span>
      <span className="flex-1 text-left text-xs font-semibold truncate">{label}</span>
      {badge && (
        <span
          className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold flex items-center gap-1 select-none ${
            badge === "New"
              ? active
                ? "bg-white/25 text-white"
                : "bg-indigo-500/15 text-indigo-500"
              : badge === "● Live"
              ? active
                ? "bg-white/25 text-white"
                : "bg-emerald-500/15 text-emerald-500"
              : active
              ? "bg-white/20 text-white"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          {badge === "New" && !active && (
            <span className="size-1 rounded-full bg-indigo-500 animate-pulse" />
          )}
          {badge}
        </span>
      )}
      {count !== undefined && (
        <span
          className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
            active
              ? "bg-white/20 text-white"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
