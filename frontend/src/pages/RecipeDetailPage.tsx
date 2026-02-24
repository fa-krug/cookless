import { useParams } from "react-router-dom";

export default function RecipeDetailPage() {
  const { id } = useParams();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Recipe {id}</h1>
    </div>
  );
}
