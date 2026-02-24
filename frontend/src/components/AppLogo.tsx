interface AppLogoProps {
  className?: string;
}

export default function AppLogo({ className = "text-4xl" }: AppLogoProps) {
  return (
    <span className={`${className} font-bold tracking-tight`}>
      <span className="text-orange-500">Cook</span>
      <span className="text-blue-500">less</span>
    </span>
  );
}
