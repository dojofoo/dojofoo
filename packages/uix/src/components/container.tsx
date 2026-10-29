import { cn } from '../lib/utils'

export const Container = ({ className, children }: { className?: string; children: React.ReactNode }) => {
    return (
        <div className={cn('bg-muted/50 @container border-t [--color-border:var(--color-border-illustration)]', className)}>
            <div className="mx-auto max-w-7xl px-2 lg:px-6">
                <div className="border-x px-2 sm:px-6">
                    <div
                        data-slot="content"
                        className="relative border-x py-16 lg:py-24">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
}
