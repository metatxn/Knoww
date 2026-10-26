"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ThemedSelect({
  id,
  name,
  options,
  describedBy,
  invalid = false,
}: {
  id: string;
  name: string;
  options: readonly [string, ...string[]];
  describedBy?: string;
  invalid?: boolean;
}) {
  const [value, setValue] = useState(options[0]);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setContainer(
      trigger.current?.closest<HTMLElement>(".kw-research-site") ??
        document.body
    );
  }, []);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger
          ref={trigger}
          id={id}
          className="input ltfm-select-trigger flex cursor-pointer items-center justify-between gap-3 py-3 text-left"
          aria-labelledby={`${id}-label ${id}-value`}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        >
          <span id={`${id}-value`}>{value}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal container={container}>
          <DropdownMenu.Content
            className="ltfm-select-content"
            align="start"
            sideOffset={6}
            collisionPadding={16}
            aria-labelledby={`${id}-label`}
            loop
          >
            <DropdownMenu.RadioGroup value={value} onValueChange={setValue}>
              {options.map((option) => (
                <DropdownMenu.RadioItem
                  key={option}
                  value={option}
                  className="ltfm-select-option"
                >
                  <span className="ltfm-select-indicator">
                    <DropdownMenu.ItemIndicator>
                      <Check size={16} aria-hidden="true" />
                    </DropdownMenu.ItemIndicator>
                  </span>
                  <span>{option}</span>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
