
import { Logo } from './logo'
import { ButtonLink } from './button'
import React from 'react'
import { useScroll, useMotionValueEvent } from 'motion/react'
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle } from './navigation-menu'
import { Menu, X, ArrowRight } from 'lucide-react'
import { useMedia } from '../hooks/use-media'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion'
import { cn } from '../lib/utils'

interface FeatureLink {
    href: string
    name: string
    description?: string
}

interface MobileLink {
    groupName?: string
    links?: FeatureLink[]
    name?: string
    href?: string
}

const features: FeatureLink[] = [
    {
        href: '#ux',
        name: 'AI',
        description: 'Generate Insights and Recommendations',
    },
    {
        href: '#performance',
        name: 'Performance',
        description: 'Lightning-fast load times',
    },
    {
        href: '#security',
        name: 'Security',
        description: 'Keep your data safe and secure',
    },
    {
        href: '#support',
        name: 'Customer Support',
        description: 'Get help when you need it',
    },
    {
        href: '#automation',
        name: 'Automation',
        description: 'Automate your workflow',
    },
    {
        href: '#scalability',
        name: 'Scalability',
        description: 'Scale your application effortlessly',
    },
    {
        href: '#backup',
        name: 'Backup',
        description: 'Keep your data backed up',
    },
    {
        href: '#analytics',
        name: 'Analytics',
        description: 'Track and measure your progress',
    },
]

const useCases: FeatureLink[] = [
    {
        href: '#ux',
        name: 'Marketplace',
        description: 'Find and buy AI tools',
    },
    {
        href: '#performance',
        name: 'Guides',
        description: 'Learn how to use AI tools',
    },
    {
        href: '#security',
        name: 'API Integration',
        description: 'Integrate AI tools into your app',
    },
    {
        href: '#support',
        name: 'Partnerships',
        description: 'Get help when you need it',
    },
]

const contentLinks: FeatureLink[] = [
    {
        name: 'Announcements',
        href: '#link',
    },
    {
        name: 'Resources',
        href: '#link',
    },
    { name: 'Blog', href: '#link' },
]

const mobileLinks: MobileLink[] = [
    {
        groupName: 'Product',
        links: features,
    },
    {
        groupName: 'Solutions',
        links: [...useCases, ...contentLinks],
    },
    { name: 'Pricing', href: '#' },
    { name: 'Company', href: '#' },
]

export function Header() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
    const [isScrolled, setIsScrolled] = React.useState(false)
    const isLarge = useMedia('(min-width: 64rem)')

    const { scrollY } = useScroll()

    useMotionValueEvent(scrollY, 'change', (latest) => {
        setIsScrolled(latest > 0)
    })

    return (
        <header
            role="banner"
            data-state={isMobileMenuOpen ? 'active' : 'inactive'}
            {...(isScrolled && { 'data-scrolled': true })}>
            <div className={cn('in-data-scrolled:border-b in-data-scrolled:bg-background/50 in-data-scrolled:backdrop-blur fixed inset-x-0 top-0 z-50', !isLarge && 'h-14 overflow-hidden border-b', isMobileMenuOpen && 'bg-background/75 h-screen backdrop-blur')}>
                <div className="mx-auto max-w-6xl px-6">
                    <div className="relative flex flex-wrap items-center justify-between lg:py-3">
                        <div className="flex justify-between gap-8 max-lg:h-14 max-lg:w-full max-lg:border-b">
                            <a
                                href="/"
                                aria-label="home"
                                className="flex items-center space-x-2">
                                <Logo uniColor />
                            </a>

                            {isLarge && <NavMenu />}
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                aria-label={isMobileMenuOpen == true ? 'Close Menu' : 'Open Menu'}
                                className="relative z-20 -m-2.5 -mr-3 block cursor-pointer p-2.5 lg:hidden">
                                <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-5 duration-200" />
                                <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-5 -rotate-180 scale-0 opacity-0 duration-200" />
                            </button>
                        </div>

                        {!isLarge && isMobileMenuOpen && <MobileMenu closeMenu={() => setIsMobileMenuOpen(false)} />}

                        <div className="max-lg:in-data-[state=active]:mt-6 in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
                            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                                <ButtonLink
                                    className="rounded-full pr-2.5" variant="ghost"
                                    href="#">
                                    <span>Continue</span>
                                    <span className="*:size-3! shadow-xs bg-card ring-border flex size-5 rounded-full ring-1 *:m-auto">
                                        <ArrowRight className="size-4" />
                                    </span>
                                </ButtonLink>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    )
}

const MobileMenu = ({ closeMenu }: { closeMenu: () => void }) => {
    return (
        <nav
            role="navigation"
            className="w-full">
            <Accordion
                type="single"
                collapsible
                className="**:hover:no-underline -mx-4 mt-0.5 space-y-0.5">
                {mobileLinks.map((link, index) => {
                    if (link.groupName && link.links) {
                        return (
                            <AccordionItem
                                key={index}
                                value={link.groupName}
                                className="group relative border-b-0 before:pointer-events-none before:absolute before:inset-x-4 before:bottom-0 before:border-b">
                                <AccordionTrigger className="**:font-normal! data-[state=open]:bg-foreground/5 flex items-center justify-between px-4 py-3 text-lg">{link.groupName}</AccordionTrigger>
                                <AccordionContent className="pb-5">
                                    <ul>
                                        {link.links.map((feature, featureIndex) => (
                                            <li key={featureIndex}>
                                                <a
                                                    href={feature.href}
                                                    onClick={closeMenu}
                                                    className="hover:bg-foreground/5 block rounded-lg px-4 py-3 text-lg">
                                                    {feature.name}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        )
                    }
                    return null
                })}
            </Accordion>
            {mobileLinks.map((link, index) => {
                if (link.name && link.href) {
                    return (
                        <a
                            key={index}
                            href={link.href}
                            onClick={closeMenu}
                            className="group relative block border-0 border-b py-4 text-lg">
                            {link.name}
                        </a>
                    )
                }
                return null
            })}
        </nav>
    )
}

const NavMenu = () => {
    return (
        <NavigationMenu className="not-dark:**:data-[slot=navigation-menu-viewport]:shadow-foreground/5 **:data-[slot=navigation-menu-viewport]:bg-card **:data-[slot=navigation-menu-viewport]:-left-1.5 **:data-[slot=navigation-menu-viewport]:rounded-3xl data-[slot=navigation-menu-viewport]:top-1 max-lg:hidden">
            <NavigationMenuList className="gap-3">
                <NavigationMenuItem>
                    <NavigationMenuTrigger>Product</NavigationMenuTrigger>
                    <NavigationMenuContent className="min-w-3xl grid grid-cols-3 divide-x p-1">
                        <div className="col-span-2 p-3">
                            <span className="text-muted-foreground ml-4 text-xs font-medium">Features</span>
                            <ul className="mt-2 grid grid-cols-2">
                                {features.map((feature, index) => (
                                    <ListItem
                                        key={index}
                                        href={feature.href}
                                        title={feature.name}
                                        description={feature.description}
                                    />
                                ))}
                            </ul>
                        </div>
                        <div className="p-3">
                            <span className="text-muted-foreground ml-4 text-xs font-medium">Agents Workflow</span>
                            <ul className="mt-2">
                                {useCases.map((useCase, index) => (
                                    <ListItem
                                        key={index}
                                        href={useCase.href}
                                        title={useCase.name}
                                        description={useCase.description}
                                    />
                                ))}
                            </ul>
                        </div>
                    </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                    <NavigationMenuTrigger>Solutions</NavigationMenuTrigger>
                    <NavigationMenuContent className="min-w-lg grid grid-cols-2 divide-x p-1">
                        <div className="p-3">
                            <span className="text-muted-foreground ml-4 text-xs font-medium">Use Cases</span>
                            <ul className="mt-2">
                                {useCases.map((useCase, index) => (
                                    <ListItem
                                        key={index}
                                        href={useCase.href}
                                        title={useCase.name}
                                        description={useCase.description}
                                    />
                                ))}
                            </ul>
                        </div>
                        <div className="p-3">
                            <span className="text-muted-foreground ml-4 text-xs font-medium">Content</span>
                            <ul className="mt-2">
                                {contentLinks.map((content, index) => (
                                    <NavigationMenuLink
                                        key={index}
                                        asChild>
                                        <a
                                            href={content.href}
                                            className="px-3">
                                            <div className="text-foreground text-sm font-medium">{content.name}</div>
                                        </a>
                                    </NavigationMenuLink>
                                ))}
                            </ul>
                        </div>
                    </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                    <NavigationMenuLink
                        asChild
                        className={navigationMenuTriggerStyle()}>
                        <a href="#">Pricing</a>
                    </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                    <NavigationMenuLink
                        asChild
                        className={navigationMenuTriggerStyle()}>
                        <a href="#">Company</a>
                    </NavigationMenuLink>
                </NavigationMenuItem>
            </NavigationMenuList>
        </NavigationMenu>
    )
}

function ListItem({ title, description, href, ...props }: React.ComponentPropsWithoutRef<'li'> & { href: string; title: string; description?: string }) {
    return (
        <li {...props}>
            <NavigationMenuLink asChild>
                <a
                    href={href}
                    className="gap-0 px-4">
                    <div className="text-foreground text-sm font-medium">{title}</div>
                    <p className="text-muted-foreground line-clamp-1 text-sm">{description}</p>
                </a>
            </NavigationMenuLink>
        </li>
    )
}
