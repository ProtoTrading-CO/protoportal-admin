export function formatOrderWorkspaceCreated(row) {
  const customer = row?.customer?.customer_name || 'the customer';
  const link = `/apollo/orders/${row.id}`;
  return `## Order Workspace created

Draft workspace created for **${customer}**.

- **Status:** ${row.status}
- **Workspace:** ${link}

Apollo will now remember tasks, promises, reminders, product lines, notes, and every timeline event for this order.`;
}

export function formatOrderAmbiguity(matches = []) {
  const lines = matches.slice(0, 6).map((c, i) => {
    const name = c.business_name || c.name || c.email || c.id;
    const contact = c.contact_name ? ` — ${c.contact_name}` : '';
    const email = c.email ? ` (${c.email})` : '';
    return `${i + 1}. **${name}**${contact}${email}`;
  });
  return `## Which customer?

I found more than one possible customer. Reply with the number or exact customer name before I create the order workspace:

${lines.join('\n')}`;
}

export function formatOrderCreateProposal({ customerName, proposedLines = [], confidence = null }) {
  const lineSummary = proposedLines.length
    ? proposedLines.map((line) => {
      const qty = line.requestedQty > 0 ? `${line.requestedQty} ` : '';
      return `- ${qty}${line.description}`;
    }).join('\n')
    : '';

  const linesBlock = lineSummary
    ? `\n\nI'll add:\n${lineSummary}`
    : '';

  const confidenceLabel = confidence == null
    ? ''
    : confidence >= 0.9
      ? '\n\n**Confidence:** High'
      : confidence >= 0.75
        ? '\n\n**Confidence:** Good'
        : '\n\n**Confidence:** Review carefully';

  return `## Ready to create draft order

I found **${customerName}**. I'm ready to create a draft Order Workspace.${linesBlock}${confidenceLabel}

Reply **confirm** to create it, or **cancel** to stop.`;
}

export function formatUnknownCustomer(customerQuery) {
  return `## Customer not found

I couldn't find a customer matching **${customerQuery}**.

Check the name or create the customer record first, then try again.`;
}

export function formatMissingCustomerQuery() {
  return `## Customer needed

Tell me which customer this order is for, for example: *Create an order for Addie*.`;
}

export function formatActionCancelled() {
  return 'Understood — I cancelled that action.';
}

export function formatDuplicateExecution() {
  return 'That action was already completed. Start a new order request if you need another workspace.';
}
