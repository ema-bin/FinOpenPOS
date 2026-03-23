"use client";

import { useState, useMemo, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductDTO } from "@/models/dto/product";

export interface ProductSearchSelectProps {
  products: ProductDTO[];
  value: number | "none";
  onValueChange: (productId: number | "none") => void;
  placeholder?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

function productSearchBucket(p: ProductDTO): string {
  return [p.name, p.category?.name ?? "", p.description ?? ""]
    .join(" ")
    .toLowerCase();
}

export function ProductSearchSelect({
  products,
  value,
  onValueChange,
  placeholder = "Seleccionar producto...",
  emptyMessage = "No se encontró ningún producto.",
  searchPlaceholder = "Buscar por nombre, categoría...",
  disabled = false,
}: ProductSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [popoverWidth, setPopoverWidth] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const debouncedSearch = useDebounce(search, 300);

  const filteredProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return products;
    const terms = debouncedSearch
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return products.filter((p) => {
      const bucket = productSearchBucket(p);
      return terms.every((t) => bucket.includes(t));
    });
  }, [products, debouncedSearch]);

  const selectedProduct =
    value !== "none" ? products.find((p) => p.id === value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
          onMouseEnter={() => {
            if (triggerRef.current) {
              setPopoverWidth(triggerRef.current.offsetWidth);
            }
          }}
        >
          <span className="truncate text-left">
            {selectedProduct ? selectedProduct.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{
          width: popoverWidth || "var(--radix-popover-trigger-width)",
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[min(320px,50vh)]">
            {filteredProducts.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              <CommandGroup>
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onValueChange("none");
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "none" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="text-muted-foreground">Seleccionar...</span>
                </CommandItem>
                {filteredProducts.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={`${product.id}-${product.name}`}
                    onSelect={() => {
                      onValueChange(product.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === product.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate">{product.name}</span>
                      {product.category?.name ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {product.category.name}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
