import { Injectable } from "@nestjs/common";

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

@Injectable()
export class ProductService {
  private products: Product[] = [
    { id: "prod-1", name: "Wireless Mouse", price: 29.99, stock: 50 },
    { id: "prod-2", name: "Mechanical Keyboard", price: 89.99, stock: 30 },
    { id: "prod-3", name: "USB-C Hub", price: 49.99, stock: 20 },
  ];

  findAll(): Product[] {
    return this.products;
  }

  findById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  decreaseStock(productId: string, quantity: number): void {
    const product = this.products.find((p) => p.id === productId);
    if (product) {
      product.stock = Math.max(0, product.stock - quantity);
    }
  }
}
