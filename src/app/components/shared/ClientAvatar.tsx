export default function ClientAvatar({ client, size = 'md' }: { client: any; size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-xs', lg: 'w-12 h-12 text-sm' };
  return (
    <div className={`${sz[size]} rounded-xl bg-gradient-to-br ${client.color} flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm`}>
      {client.avatar}
    </div>
  );
}
