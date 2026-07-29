import { ProductForm } from "@/components/product-form";

type Params = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: Params) {
  const { id } = await params;
  return <ProductForm mode="edit" productId={id} />;
}
