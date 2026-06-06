export type IntegrationPreset = {
  id: string;
  category: "SELL_SIDE_PORTAL" | "BUY_SIDE_PORTAL" | "NATIVE_ERP" | "NETWORK";
  vendor: string;
  title: string;
  summary: string;
  supportedMessages: string[];
  connection: {
    connection_type: "EMAIL" | "SFTP" | "AS2" | "API" | "VAN";
    direction: "INBOUND" | "OUTBOUND" | "BOTH";
    message_type: string;
    message_version?: string;
    config_json: Record<string, string>;
  };
  onboarding: {
    message_family: string;
    message_standard: string;
    message_version?: string;
    direction: "INBOUND" | "OUTBOUND" | "BOTH";
    target_message_family: string;
    invoice_profile_type: string;
    extraction_mode: string;
    sample_reference: string;
  };
};

const commonPortalMessages = ["ORDERS", "ORDCHG", "ORDRSP", "ASN", "INVOICE"];

export const integrationPresets: IntegrationPreset[] = [
  {
    id: "sell-side-ariba",
    category: "SELL_SIDE_PORTAL",
    vendor: "Ariba",
    title: "Sell Side Portal",
    summary: "Customer POs, change orders, order confirmations, ASNs, and invoices.",
    supportedMessages: commonPortalMessages,
    connection: {
      connection_type: "API",
      direction: "OUTBOUND",
      message_type: "ORDERS",
      message_version: "cXML",
      config_json: {
        endpoint_url: "https://ariba.example.com/api/orders",
        http_method: "POST",
        auth_type: "OAUTH2",
        token: "PASTE_TOKEN_HERE",
      },
    },
    onboarding: {
      message_family: "ORDERS",
      message_standard: "XML",
      message_version: "cXML",
      direction: "OUTBOUND",
      target_message_family: "ORDERS",
      invoice_profile_type: "AR_INVOICE",
      extraction_mode: "XML_MAP",
      sample_reference: "ARIBA_SELL_SIDE",
    },
  },
  {
    id: "buy-side-coupa",
    category: "BUY_SIDE_PORTAL",
    vendor: "Coupa",
    title: "Buy Side Portal",
    summary: "Vendor POs, change requests, confirmations, goods receipts, and AP invoices.",
    supportedMessages: ["PO", "ORDCHG", "ORDRSP", "GRN", "AP_INVOICE"],
    connection: {
      connection_type: "API",
      direction: "INBOUND",
      message_type: "AP_INVOICE",
      message_version: "v1",
      config_json: {
        endpoint_url: "https://coupa.example.com/api/invoices",
        http_method: "POST",
        auth_type: "OAUTH2",
        token: "PASTE_TOKEN_HERE",
      },
    },
    onboarding: {
      message_family: "AP_INVOICE",
      message_standard: "JSON",
      message_version: "v1",
      direction: "INBOUND",
      target_message_family: "AP_INVOICE",
      invoice_profile_type: "AP_INVOICE",
      extraction_mode: "JSON_MAP",
      sample_reference: "COUPA_BUY_SIDE",
    },
  },
  {
    id: "network-sps-commerce",
    category: "NETWORK",
    vendor: "SPS Commerce",
    title: "Retail Network",
    summary: "Order, response, ASN, and invoice exchange across retail trading partners.",
    supportedMessages: ["ORDERS", "ORDRSP", "ORDCHG", "DESADV", "INVOIC"],
    connection: {
      connection_type: "VAN",
      direction: "BOTH",
      message_type: "ORDERS",
      message_version: "X12 / EDIFACT",
      config_json: {
        provider: "SPS Commerce",
        mailbox: "PRIMARY",
        network_id: "PASTE_NETWORK_ID",
      },
    },
    onboarding: {
      message_family: "ORDERS",
      message_standard: "EDIFACT",
      message_version: "D96A",
      direction: "BOTH",
      target_message_family: "ORDERS",
      invoice_profile_type: "INVOICE",
      extraction_mode: "EDI_PARSER",
      sample_reference: "SPS_COMMERCE_NETWORK",
    },
  },
  {
    id: "erp-sap-idoc",
    category: "NATIVE_ERP",
    vendor: "SAP",
    title: "Native ERP IDoc",
    summary: "Native IDoc routing for orders, order responses, ASNs, and invoices.",
    supportedMessages: ["ORDERS", "ORDRSP", "ORDCHG", "DESADV", "INVOIC"],
    connection: {
      connection_type: "AS2",
      direction: "BOTH",
      message_type: "INVOIC",
      message_version: "INVOIC02",
      config_json: {
        as2_id: "ORDANEX",
        partner_as2_id: "SAP",
        endpoint: "https://sap.example.com/as2",
        certificate_ref: "sap-cert",
      },
    },
    onboarding: {
      message_family: "INVOICE",
      message_standard: "IDOC",
      message_version: "INVOIC02",
      direction: "OUTBOUND",
      target_message_family: "INVOIC",
      invoice_profile_type: "AR_INVOICE",
      extraction_mode: "EDI_PARSER",
      sample_reference: "SAP_NATIVE_IDOC",
    },
  },
  {
    id: "erp-oracle",
    category: "NATIVE_ERP",
    vendor: "Oracle",
    title: "Native Invoice API",
    summary: "Invoice and order APIs for Oracle-led enterprise workflows.",
    supportedMessages: ["ORDERS", "ORDRSP", "DESADV", "INVOICE", "AP_INVOICE"],
    connection: {
      connection_type: "API",
      direction: "OUTBOUND",
      message_type: "INVOICE",
      message_version: "v1",
      config_json: {
        endpoint_url: "https://oracle.example.com/api/invoices",
        http_method: "POST",
        auth_type: "BEARER",
        token: "PASTE_TOKEN_HERE",
      },
    },
    onboarding: {
      message_family: "INVOICE",
      message_standard: "XML",
      message_version: "v1",
      direction: "OUTBOUND",
      target_message_family: "INVOICE",
      invoice_profile_type: "AR_INVOICE",
      extraction_mode: "XML_MAP",
      sample_reference: "ORACLE_NATIVE_INVOICE",
    },
  },
  {
    id: "erp-dynamics-365",
    category: "NATIVE_ERP",
    vendor: "Dynamics 365",
    title: "Native Business API",
    summary: "Order and invoice automation for Dynamics 365 environments.",
    supportedMessages: ["ORDERS", "ORDRSP", "ORDCHG", "ASN", "INVOICE"],
    connection: {
      connection_type: "API",
      direction: "BOTH",
      message_type: "ORDERS",
      message_version: "v1",
      config_json: {
        endpoint_url: "https://d365.example.com/api/orders",
        http_method: "POST",
        auth_type: "BEARER",
        token: "PASTE_TOKEN_HERE",
      },
    },
    onboarding: {
      message_family: "ORDERS",
      message_standard: "JSON",
      message_version: "v1",
      direction: "BOTH",
      target_message_family: "ORDERS",
      invoice_profile_type: "AR_INVOICE",
      extraction_mode: "JSON_MAP",
      sample_reference: "D365_NATIVE_API",
    },
  },
  {
    id: "erp-netsuite",
    category: "NATIVE_ERP",
    vendor: "NetSuite",
    title: "Native SuiteTalk / SFTP",
    summary: "ERP-agnostic invoice and order automation for NetSuite-led teams.",
    supportedMessages: ["ORDERS", "ORDRSP", "DESADV", "INVOICE", "AP_INVOICE"],
    connection: {
      connection_type: "SFTP",
      direction: "BOTH",
      message_type: "INVOICE",
      message_version: "v1",
      config_json: {
        host: "netsuite.example.com",
        port: "22",
        username: "integration",
        password_token: "PASTE_TOKEN_HERE",
        folder: "/inbound",
        archive_path: "/archive",
      },
    },
    onboarding: {
      message_family: "INVOICE",
      message_standard: "XML",
      message_version: "v1",
      direction: "BOTH",
      target_message_family: "INVOICE",
      invoice_profile_type: "AP_INVOICE",
      extraction_mode: "XML_MAP",
      sample_reference: "NETSUITE_NATIVE",
    },
  },
];

export function buildConnectionPreset(partnerName: string, preset: IntegrationPreset) {
  return {
    connection_name: `${partnerName.trim() || "Ordanex"} - ${preset.vendor} ${preset.title}`,
    connection_type: preset.connection.connection_type,
    direction: preset.connection.direction,
    message_type: preset.connection.message_type,
    message_version: preset.connection.message_version || "",
    config_json: { ...preset.connection.config_json },
    is_active: true,
  };
}

export function buildOnboardingPreset(partnerName: string, preset: IntegrationPreset) {
  return {
    profile_name: `${partnerName.trim() || "Ordanex"} - ${preset.vendor} ${preset.title}`,
    message_family: preset.onboarding.message_family,
    message_standard: preset.onboarding.message_standard,
    message_version: preset.onboarding.message_version || "",
    direction: preset.onboarding.direction,
    sample_reference: preset.onboarding.sample_reference,
    target_message_family: preset.onboarding.target_message_family,
    invoice_profile_type: preset.onboarding.invoice_profile_type,
    extraction_mode: preset.onboarding.extraction_mode,
  };
}
