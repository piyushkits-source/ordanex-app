
# Ordanex Canonical Schema Design

This canonical schema is designed to be:
- input-format agnostic: PDF, image/OCR, X12, EDIFACT, XML, JSON, Excel, CSV
- ERP agnostic: SAP, Oracle, D365, NetSuite, generic REST/XML/CSV
- message-version aware: X12 4010/5010, EDIFACT D96A/D97A/D97B, SAP ORDERS03/ORDERS05, etc.
- reusable across document types: PO, Order Response, Order Change, ASN, Invoice

## Core principles

1. **One canonical document model**
   All source adapters must normalize into the same business structure before mapping.

2. **Separate canonical from output**
   Canonical is the source of truth for transformation. SAP IDoc, Oracle XML, D365 JSON, etc. are target adapters.

3. **Support multiple identifiers per item**
   Never collapse buyer/supplier/internal/GTIN codes into one field.

4. **Keep transport out of schema**
   AS2/SFTP/API belongs in connection/flow setup, not canonical document structure.

## Top-level structure

```json
{
  "meta": {},
  "header": {},
  "parties": {},
  "references": [],
  "dates": [],
  "addresses": [],
  "items": [],
  "totals": {},
  "attachments": [],
  "raw_extensions": {}
}
```

## `meta`
Technical and routing metadata.

```json
{
  "document_type": "PO",
  "message_direction": "INBOUND",
  "source_format": "PDF",
  "source_standard": "NONE",
  "source_message_type": "PO",
  "source_version": null,
  "target_erp": "SAP",
  "target_standard": "IDOC",
  "target_message_type": "ORDERS",
  "target_version": "ORDERS05",
  "flow_id": "uuid",
  "client_id": "DU0001",
  "vertical_id": "uuid",
  "partner_id": "uuid",
  "source_document_id": "monitor-message-id"
}
```

## `header`
Single-instance commercial document attributes.

```json
{
  "document_number": "4500123456",
  "document_date": "2026-04-16",
  "currency_code": "USD",
  "document_status": "NEW",
  "buyer_order_type": "NB",
  "seller_order_type": "OR",
  "incoterm_code": "FOB",
  "payment_term_code": "0001",
  "notes": "free text"
}
```

## `parties`
Logical business partners. These are roles, not ERP-specific segments.

```json
{
  "buyer": {
    "partner_name": "Buyer Corp",
    "partner_code": "BUY01",
    "identifier_type": "BUYER",
    "external_ids": {
      "customer_code": "BUY01"
    }
  },
  "seller": {
    "partner_name": "Seller Corp",
    "partner_code": "SUP01",
    "identifier_type": "SELLER",
    "external_ids": {
      "supplier_code": "SUP01"
    }
  },
  "ship_to": {
    "partner_name": "Plant A",
    "partner_code": "SHIP01",
    "identifier_type": "SHIP_TO",
    "external_ids": {
      "ship_to_code": "SHIP01"
    }
  },
  "bill_to": {
    "partner_name": "Accounts Payable",
    "partner_code": "BILL01",
    "identifier_type": "BILL_TO"
  }
}
```

## `references`

```json
[
  {
    "reference_type": "CUSTOMER_PO",
    "reference_number": "PO-7788"
  }
]
```

## `dates`

```json
[
  {
    "date_type": "DOCUMENT_DATE",
    "date_value": "2026-04-16"
  },
  {
    "date_type": "REQUESTED_DELIVERY_DATE",
    "date_value": "2026-04-30"
  }
]
```

## `addresses`

```json
[
  {
    "address_role": "SHIP_TO",
    "name": "Plant A",
    "line1": "123 Industrial Road",
    "line2": null,
    "city": "Bangalore",
    "state": "KA",
    "postal_code": "560001",
    "country_code": "IN",
    "resolved_master_id": "uuid",
    "resolved_codes": {
      "ship_to_code": "SHIP01",
      "sold_to_code": "SOLD01"
    },
    "match_score": 0.96
  }
]
```

## `items`

```json
[
  {
    "line_number": "10",
    "buyer_product_code": "ABC-100",
    "supplier_product_code": "SUP-900",
    "internal_material_code": "MAT001",
    "gtin": "0123456789012",
    "description": "Product A",
    "ordered_quantity": 10,
    "ordered_uom": "BOX",
    "normalized_quantity": 100,
    "normalized_uom": "EA",
    "unit_price": 12.5,
    "price_basis_quantity": 1,
    "price_basis_uom": "EA",
    "currency_code": "USD",
    "requested_delivery_date": "2026-04-30",
    "plant_code": "1000",
    "storage_location": "0001",
    "customer_line_reference": "1",
    "notes": null,
    "schedule_lines": [
      {
        "schedule_number": "1",
        "quantity": 100,
        "uom": "EA",
        "delivery_date": "2026-04-30"
      }
    ],
    "raw_extensions": {}
  }
]
```

### Why these item fields matter

- `buyer_product_code` -> aligns to SAP `E1EDP19 QUALF=001`
- `supplier_product_code` -> aligns to SAP `E1EDP19 QUALF=002`
- `internal_material_code` -> internal ERP material or mapped material
- `gtin` -> future support for barcode/global trade item number
- `ordered_*` preserves source truth
- `normalized_*` supports UOM conversion before ERP output

## `totals`

```json
{
  "line_count": 2,
  "document_total_amount": 1250.0,
  "currency_code": "USD"
}
```

## SAP IDoc alignment

- `header.document_number` -> `E1EDK02 QUALF=001 BELNR`
- `header.document_date` -> `E1EDK03 IDDAT=012 DATUM`
- `header.currency_code` -> `E1EDK01 CURCY`
- `parties.buyer` / `parties.seller` / `parties.ship_to` / `parties.bill_to` -> `E1EDKA1`

### E1EDP19 qualifier mapping
- `items[].buyer_product_code` -> `E1EDP19 QUALF=001 IDTNR`
- `items[].supplier_product_code` -> `E1EDP19 QUALF=002 IDTNR`

Do **not** hardcode only `QUALF=002`. Build dynamically from available identifiers and mapping rules.
