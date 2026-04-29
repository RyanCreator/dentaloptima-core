# Design System Components

This document outlines the reusable components and patterns for consistent UI throughout the application.

## Core Principles

1. **Information Display**: Only show valuable information - no stating the obvious
2. **Time Format**: Always use HH:mm (no seconds)
3. **Layout**: Grid-based for perfect alignment
4. **Interactions**: Sheets (not dialogs) for editing/details
5. **Responsive**: Mobile-first with proper stacking

---

## Components

### SectionHeader

Consistent section titles with optional action buttons. Stacks on mobile, inline on desktop.

```tsx
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

<SectionHeader
  title="Time Off & Schedule Exceptions"
  action={
    <Button size="sm" className="w-full sm:w-auto">
      <Plus className="h-4 w-4 mr-2" />
      Add Time Off
    </Button>
  }
/>
```

---

### ListItem Components

For consistent list layouts with grid-based alignment.

**ListItem** - Base component for list items
```tsx
import { ListItem } from "@/components/ListItem";

<ListItem onClick={() => handleClick()}>
  <div className="grid grid-cols-[100px,1fr] gap-3">
    <span className="font-medium">Monday</span>
    <span className="text-sm text-muted-foreground">09:00 - 17:00</span>
  </div>
</ListItem>
```

**ListItemGrid** - Pre-configured grid layout
```tsx
import { ListItemGrid } from "@/components/ListItem";

<ListItemGrid
  label="Monday"
  value="09:00 - 17:00"
  onClick={() => editDay()}
/>
```

**ListItemLabelValue** - For detail views
```tsx
import { ListItemLabelValue } from "@/components/ListItem";

<ListItemLabelValue label="Email" value="user@example.com" />
```

---

### DetailSheet

Pre-configured sheet component that slides from right, full screen on mobile.

```tsx
import { DetailSheet } from "@/components/DetailSheet";
import { Button } from "@/components/ui/button";

<DetailSheet
  trigger={<Button>Edit Details</Button>}
  title="Edit Schedule"
>
  <div className="space-y-4">
    {/* Form content here */}
  </div>
</DetailSheet>
```

**Controlled version:**
```tsx
<DetailSheet
  trigger={<Button>Edit</Button>}
  title="Edit Schedule"
  open={isOpen}
  onOpenChange={setIsOpen}
>
  {/* Content */}
</DetailSheet>
```

---

### InfoCard Components

For displaying information in cards.

```tsx
import { InfoCard, InfoCardSection } from "@/components/InfoCard";
import { ListItemLabelValue } from "@/components/ListItem";

<InfoCard>
  <InfoCardSection>
    <ListItemLabelValue label="Email" value="user@example.com" />
    <ListItemLabelValue label="Phone" value="+44 123 456 789" />
  </InfoCardSection>
</InfoCard>
```

---

### FormField Components

For consistent form layouts in sheets.

```tsx
import { FormField, FormFieldGroup } from "@/components/FormField";
import { Input } from "@/components/ui/input";

<FormField label="Clinic Name" helpText="This will appear on all communications">
  <Input value={name} onChange={(e) => setName(e.target.value)} />
</FormField>

<FormFieldGroup columns={2}>
  <FormField label="Start Time">
    <Input type="time" />
  </FormField>
  <FormField label="End Time">
    <Input type="time" />
  </FormField>
</FormFieldGroup>
```

---

## Utilities

### Time Formatting

```tsx
import { formatTime, formatTimeRange, formatTimeFromDate } from "@/lib/timeUtils";

// Format time string
formatTime("09:30:00") // "09:30"

// Format time range
formatTimeRange("09:00:00", "17:00:00") // "09:00 - 17:00"

// Format Date object
formatTimeFromDate(new Date()) // "14:30"
```

---

## Layout Patterns

### TopBar with Back Button

```tsx
<Layout title="Page Title" onBack={() => navigate(-1)}>
  {children}
</Layout>
```

### Responsive Button Placement

```tsx
// Full width on mobile, auto on desktop
<Button className="w-full sm:w-auto">Save</Button>
```

### Grid Layouts

```tsx
// Two columns for form fields
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

// Label-value pairs
<div className="grid grid-cols-[80px,1fr] gap-2">

// List items with fixed first column
<div className="grid grid-cols-[100px,1fr] gap-3">

// Content with action button
<div className="grid grid-cols-[1fr,auto] gap-3 items-start">
```

---

## Common Patterns

### Clickable List with Detail Sheet

```tsx
import { ListItemGrid } from "@/components/ListItem";
import { DetailSheet } from "@/components/DetailSheet";
import { Button } from "@/components/ui/button";

const [selectedItem, setSelectedItem] = useState(null);
const [isOpen, setIsOpen] = useState(false);

<div className="divide-y border rounded-lg">
  {items.map((item) => (
    <ListItemGrid
      key={item.id}
      label={item.name}
      value={item.details}
      onClick={() => {
        setSelectedItem(item);
        setIsOpen(true);
      }}
    />
  ))}
</div>

<DetailSheet
  trigger={<></>}
  title="Edit Item"
  open={isOpen}
  onOpenChange={setIsOpen}
>
  {/* Edit form */}
</DetailSheet>
```

### Section with Add Button

```tsx
import { SectionHeader } from "@/components/SectionHeader";
import { InfoCard } from "@/components/InfoCard";
import { DetailSheet } from "@/components/DetailSheet";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

<InfoCard>
  <SectionHeader
    title="Staff Members"
    action={
      <DetailSheet
        trigger={
          <Button size="sm" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Staff
          </Button>
        }
        title="Add Staff Member"
      >
        {/* Add form */}
      </DetailSheet>
    }
  />
  {/* List content */}
</InfoCard>
```

---

## DO's and DON'Ts

### DO ✅
- Use `Sheet` for all editing/detail views
- Use grid layouts for alignment
- Format times as HH:mm
- Stack buttons below titles on mobile
- Keep list views minimal (summary only)
- Use `w-full sm:w-auto` for responsive buttons
- Truncate long text with `truncate`

### DON'T ❌
- Use `Dialog` or `Popover` for editing
- Use flex with justify-between for labels/values
- Show seconds in time displays
- Repeat page title in content
- Add unnecessary badges or status indicators
- Create overlapping elements on mobile
- Use fixed widths that break on mobile
