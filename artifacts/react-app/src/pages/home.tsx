import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Terminal, Zap, ArrowRight, ShieldCheck, Code2, Paintbrush, Database, LayoutTemplate, Workflow, Box, Component } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

const FADE_IN = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

const STAGGER = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function Home() {
  const [interactiveTab, setInteractiveTab] = useState("form");
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="min-h-[100dvh] bg-background w-full overflow-hidden flex flex-col relative">
      
      {/* Decorative Background */}
      <div className="absolute inset-0 bg-dot-pattern opacity-50 pointer-events-none z-0"></div>
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none z-0"></div>

      {/* Navigation */}
      <header className="w-full border-b bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <Box className="w-5 h-5 text-primary" />
            <span>Forge</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#components" className="hover:text-foreground transition-colors">Components</a>
            <a href="#architecture" className="hover:text-foreground transition-colors">Architecture</a>
          </nav>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="hidden sm:flex">Documentation</Button>
            <Button size="sm">Get Started</Button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full z-10">
        
        {/* Hero Section */}
        <section className="pt-24 pb-32 px-6 max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          <motion.div 
            className="flex-1 space-y-8"
            initial="hidden"
            animate="visible"
            variants={STAGGER}
          >
            <motion.div variants={FADE_IN} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Zap className="w-4 h-4" />
              <span>Ready for Production</span>
            </motion.div>
            
            <motion.h1 variants={FADE_IN} className="text-5xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.1]">
              Build without <br/><span className="text-primary">friction.</span>
            </motion.h1>
            
            <motion.p variants={FADE_IN} className="text-lg lg:text-xl text-muted-foreground max-w-lg leading-relaxed">
              A meticulously crafted React starter template. Equipped with Tailwind CSS, shadcn/ui, framer-motion, and a solid routing foundation.
            </motion.p>
            
            <motion.div variants={FADE_IN} className="flex flex-wrap items-center gap-4">
              <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/25">
                Start Building <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 text-base bg-background">
                View GitHub
              </Button>
            </motion.div>
          </motion.div>

          <motion.div 
            className="flex-1 w-full max-w-md lg:max-w-none relative"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {/* Abstract representation of the stack */}
            <div className="relative aspect-square md:aspect-[4/3] lg:aspect-square bg-card border rounded-2xl shadow-xl overflow-hidden p-8 flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />
              
              <div className="z-10 space-y-4">
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-destructive/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <Badge variant="secondary" className="font-mono text-xs">src/main.tsx</Badge>
                </div>
                
                <div className="space-y-3 font-mono text-sm">
                  <div className="flex gap-4"><span className="text-primary font-bold">import</span> <span className="text-foreground">App</span> <span className="text-primary font-bold">from</span> <span className="text-muted-foreground">'./App'</span></div>
                  <div className="flex gap-4"><span className="text-primary font-bold">import</span> <span className="text-foreground">{' { Provider } '}</span> <span className="text-primary font-bold">from</span> <span className="text-muted-foreground">'ui'</span></div>
                  <div className="h-4" />
                  <div className="text-foreground">const root = createRoot(document.getElementById('root'));</div>
                  <div className="text-foreground">root.render(</div>
                  <div className="pl-4 text-foreground">{'<Provider>'}</div>
                  <div className="pl-8 text-primary font-bold">{'<App />'}</div>
                  <div className="pl-4 text-foreground">{'</Provider>'}</div>
                  <div className="text-foreground">);</div>
                </div>
              </div>

              <div className="z-10 mt-auto flex items-center justify-end gap-2 pt-6">
                <Badge variant="outline" className="bg-background shadow-sm"><Terminal className="w-3 h-3 mr-1"/> Vite</Badge>
                <Badge variant="outline" className="bg-background shadow-sm"><Code2 className="w-3 h-3 mr-1"/> TS</Badge>
                <Badge variant="outline" className="bg-background shadow-sm"><Paintbrush className="w-3 h-3 mr-1"/> TW</Badge>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-muted/30 border-y">
          <div className="max-w-6xl mx-auto px-6">
            <div className="mb-16 text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-3xl font-bold tracking-tight">Everything you need. Nothing you don't.</h2>
              <p className="text-muted-foreground">A curated selection of the best tools in the React ecosystem, pre-configured to work together seamlessly.</p>
            </div>

            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={STAGGER}
            >
              {[
                { icon: LayoutTemplate, title: "shadcn/ui", desc: "Beautifully designed components that you can copy and paste into your apps." },
                { icon: Paintbrush, title: "Tailwind CSS", desc: "A utility-first CSS framework packed with classes that can be composed to build any design." },
                { icon: Database, title: "React Query", desc: "Powerful asynchronous state management, server-state utilities and data fetching." },
                { icon: Workflow, title: "Wouter", desc: "A minimalist-friendly routing solution. Tiny footprint, exactly what you need." },
                { icon: ShieldCheck, title: "TypeScript", desc: "Strict typing by default. Catch errors before they hit production." },
                { icon: Component, title: "Framer Motion", desc: "A production-ready motion library for React. Delightful animations made easy." }
              ].map((feature, i) => (
                <motion.div key={i} variants={FADE_IN}>
                  <Card className="h-full bg-background border-border/50 hover:border-primary/20 transition-colors shadow-sm">
                    <CardHeader>
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                        <feature.icon className="w-5 h-5 text-primary" />
                      </div>
                      <CardTitle className="text-xl">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Interactive Component Section */}
        <section id="components" className="py-32 max-w-6xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row gap-16 items-start">
            <motion.div 
              className="flex-1 space-y-6 lg:sticky lg:top-32"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={STAGGER}
            >
              <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">Crafted components out of the box</h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                The components aren't hidden away in an npm package. They live in your source code. You have full control to customize them to match your brand.
              </p>
              
              <div className="space-y-4 pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">1</div>
                  <span className="font-medium">Accessible by default</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">2</div>
                  <span className="font-medium">Dark mode ready</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">3</div>
                  <span className="font-medium">Fully typed</span>
                </div>
              </div>
            </motion.div>

            <motion.div 
              className="flex-1 w-full"
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <Card className="shadow-lg border-primary/10 overflow-hidden">
                <Tabs value={interactiveTab} onValueChange={setInteractiveTab} className="w-full">
                  <div className="px-6 pt-6 border-b border-border/50 bg-muted/10">
                    <TabsList className="grid w-full grid-cols-2 max-w-[400px] mb-6">
                      <TabsTrigger value="form">Account Settings</TabsTrigger>
                      <TabsTrigger value="cards">Data Display</TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <div className="p-6 bg-background min-h-[400px]">
                    <TabsContent value="form" className="space-y-6 mt-0 outline-none">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Display Name</Label>
                          <Input id="name" defaultValue="Jane Developer" />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="email">Email Address</Label>
                          <Input id="email" type="email" defaultValue="jane@example.com" />
                        </div>
                        
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                          <div className="space-y-0.5">
                            <Label className="text-base">Push Notifications</Label>
                            <p className="text-sm text-muted-foreground">Receive updates on your activity.</p>
                          </div>
                          <Switch checked={notifications} onCheckedChange={setNotifications} />
                        </div>
                      </div>
                      
                      <div className="flex justify-end pt-4">
                        <Button>Save Changes</Button>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="cards" className="mt-0 outline-none space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Card className="bg-card shadow-sm">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">$45,231.89</div>
                            <p className="text-xs text-green-500 mt-1 flex items-center">
                              <ArrowRight className="w-3 h-3 mr-1 -rotate-45" />
                              +20.1% from last month
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="bg-card shadow-sm">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">+2,350</div>
                            <p className="text-xs text-muted-foreground mt-1">
                              +180 new users this week
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                      
                      <Card className="shadow-sm">
                        <CardHeader>
                          <CardTitle className="text-base">Recent Tasks</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Checkbox id="t1" defaultChecked />
                            <div className="grid gap-1.5 leading-none">
                              <label htmlFor="t1" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 line-through text-muted-foreground">Update dependency graph</label>
                            </div>
                            <Badge variant="outline" className="ml-auto">Completed</Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <Checkbox id="t2" />
                            <div className="grid gap-1.5 leading-none">
                              <label htmlFor="t2" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Review pull requests</label>
                            </div>
                            <Badge variant="secondary" className="ml-auto">In Progress</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </div>
                </Tabs>
              </Card>
            </motion.div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/20 w-full py-12 mt-auto">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-semibold">
            <Box className="w-5 h-5 text-primary" />
            <span>Forge React Starter</span>
          </div>
          
          <div className="text-sm text-muted-foreground">
            Built for productivity. Designed for aesthetics.
          </div>
          
          <div className="flex gap-4">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Documentation
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              GitHub
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
