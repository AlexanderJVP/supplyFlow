import type { Permissions } from '@manufacturing/shared';

const DOMAIN_LABELS: Record<keyof Permissions, string> = {
  items: 'Items',
  bom: 'BOM',
  inventory: 'Inventory',
  production: 'Production',
  proposals: 'Proposals',
  admin: 'Admin',
};

export default function PermissionsEditor({
  value,
  onChange,
}: {
  value: Permissions;
  onChange: (next: Permissions) => void;
}) {
  function toggle(domain: keyof Permissions, action: string) {
    onChange({
      ...value,
      [domain]: {
        ...value[domain],
        [action]: !(value[domain] as Record<string, boolean>)[action],
      },
    });
  }

  return (
    <table style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {(Object.keys(value) as Array<keyof Permissions>).map((domain) => (
          <tr key={domain}>
            <td
              style={{
                fontWeight: 600,
                paddingRight: 12,
                verticalAlign: 'top',
              }}
            >
              {DOMAIN_LABELS[domain]}
            </td>
            <td>
              {Object.entries(value[domain] as Record<string, boolean>).map(
                ([action, enabled]) => (
                  <label
                    key={action}
                    style={{ marginRight: 16, whiteSpace: 'nowrap' }}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggle(domain, action)}
                    />{' '}
                    {action}
                  </label>
                )
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
