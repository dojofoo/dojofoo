import * as React from 'react'
import { cn } from '../lib/utils'

/** A text field as the onboarding draws its fields (styles/onboarding.css): the card's surface, a ring, the ink ring on focus */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
    return (
        <input
            type={type}
            data-slot="input"
            className={cn('ui-ob-input h-10', className)}
            {...props}
        />
    )
}

export { Input }
