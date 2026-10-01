interface Props {
  message?: string;
  /** El comando que llena lo que falta. */
  comando?: string;
}

export default function EmptyState({
  message = "No hay datos disponibles.",
  comando = "python main.py ingest 2025",
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-dim">
      <span className="text-4xl mb-4">⚾</span>
      <p className="text-sm">{message}</p>
      <p className="text-xs mt-2 opacity-60">
        Corre: <code className="bg-header px-1 rounded">{comando}</code>
      </p>
    </div>
  );
}
