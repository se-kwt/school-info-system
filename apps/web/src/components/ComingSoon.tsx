export function ComingSoon({ feature }: { feature: string }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">{feature}</h1>
      <p className="mt-2 text-gray-500">This feature is coming soon.</p>
    </div>
  );
}
