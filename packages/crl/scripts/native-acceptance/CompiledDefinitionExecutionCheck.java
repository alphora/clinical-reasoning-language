// Maintainer execution probe. Index fields: caseId, repository file, data file, PlanDefinition id, subject.
// Run in a bounded JVM via the engine PropertiesLauncher; all outputs go to a new private directory.
import java.nio.file.*;
import java.lang.reflect.*;
import java.util.*;
public class CompiledDefinitionExecutionCheck {
 static String quote(String s){return "\""+s.replace("\\","\\\\").replace("\"","\\\"")+"\"";}
 public static void main(String[] args)throws Exception{
  if(args.length!=2&&(args.length!=3||!"--require-cache".equals(args[2])))throw new IllegalArgumentException("INDEX NEW_OUTPUT [--require-cache]");
  Class<?> driver=Class.forName("ApplyDriver");Method apply=driver.getMethod("main",String[].class);
  Field libs=null,models=null,key=null;try{libs=driver.getDeclaredField("compiledLibraries");models=driver.getDeclaredField("compiledModels");key=driver.getDeclaredField("compilationKey");libs.setAccessible(true);models.setAccessible(true);key.setAccessible(true);}catch(NoSuchFieldException baseline){if(args.length>2)throw baseline;}
  Path out=Path.of(args[1]);Files.createDirectory(out);Object previous=null;int n=0,nonempty=0;
  for(String line:Files.readAllLines(Path.of(args[0]))){String[] c=line.split("\t",-1);if(c.length!=5)throw new IllegalArgumentException("index requires five fields");Path dir=out.resolve(String.format("%03d",n++));Files.createDirectory(dir);long start=System.nanoTime();
   try{apply.invoke(null,(Object)new String[]{c[1],c[3],c[4],"--session",c[2],dir.resolve("native").toString(),"33554432","100663296"});}catch(InvocationTargetException failure){throw new RuntimeException("Native case failed: "+c[0],failure.getCause());}
   Map<?,?> l=libs==null?Map.of():(Map<?,?>)libs.get(null),m=models==null?Map.of():(Map<?,?>)models.get(null);if(!l.isEmpty())nonempty++;
   List<String> ids=new ArrayList<>(),identifiers=new ArrayList<>();for(Object id:l.keySet()){ids.add((String)id.getClass().getMethod("getId").invoke(id));identifiers.add((String)id.getClass().getMethod("getId").invoke(id)+"|"+id.getClass().getMethod("getVersion").invoke(id)+"|"+id.getClass().getMethod("getSystem").invoke(id));}Collections.sort(ids);Collections.sort(identifiers);
   String row="{\"definitionKeyPresent\":"+(key!=null&&key.get(null)!=null)+",\"libraryIdentifiers\":["+String.join(",",identifiers.stream().map(CompiledDefinitionExecutionCheck::quote).toList())+"],\"caseId\":"+quote(c[0])+",\"nativeMs\":"+((System.nanoTime()-start)/1e6)+",\"compiledLibraries\":"+l.size()+",\"compiledModels\":"+m.size()+",\"sameMapAsPrior\":"+(l==previous)+",\"libraryIds\":["+String.join(",",ids.stream().map(CompiledDefinitionExecutionCheck::quote).toList())+"]}";
   Files.writeString(dir.resolve("cache-proof.json"),row+"\n");previous=l;
  }
  if(args.length>2&&nonempty==0)throw new AssertionError("Compiled library cache never populated");
  System.out.println("COMPILED_DEFINITION_EXECUTION_CALLS="+n+" NONEMPTY_CACHE_CALLS="+nonempty);
 }
}
