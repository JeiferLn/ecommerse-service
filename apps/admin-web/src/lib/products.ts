export type ProductImage = {
  id: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
};

export type Product = {
  id: string;
  title: string;
  description: string;
  price: string;
  quantity: number;
  isActive: boolean;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  images: ProductImage[];
  createdAt: string;
};

export type Category = {
  id: string;
  name: string;
  _count?: { products: number };
};
