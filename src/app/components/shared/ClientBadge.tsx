export default function ClientBadge({ client }: { client: any }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${client.lightBg} ${client.lightBorder} ${client.textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${client.dotColor}`}></span>
      {client.name}
    </span>
  );
}
