// Maintainer native check: run through the engine PropertiesLauncher with this class and the shipped driver.
// No patient evaluation or clinical fixture/oracle edits. Tests the content/isolation boundaries of compilation reuse.
import java.lang.reflect.*;
import java.util.*;
public class CompiledDefinitionCacheCheck {
 static int checks;
 static void check(boolean yes,String why){if(!yes)throw new AssertionError(why);checks++;}
 public static void main(String[] args)throws Exception{
  Class<?> driver=Class.forName("ApplyDriver"),fc=Class.forName("ca.uhn.fhir.context.FhirContext"),bc=Class.forName("org.hl7.fhir.r4.model.Bundle"),pc=Class.forName("ca.uhn.fhir.parser.IParser");
  Object ctx=fc.getMethod("forR4Cached").invoke(null),parser=fc.getMethod("newJsonParser").invoke(ctx);Method parse=pc.getMethod("parseResource",Class.class,String.class),settings=driver.getDeclaredMethod("compilationSettings",fc,bc,bc);settings.setAccessible(true);
  Class<?> cs=Class.forName("org.opencds.cqf.fhir.cr.CrSettings"),es=Class.forName("org.opencds.cqf.fhir.cql.EvaluationSettings");
  Method evaluation=cs.getMethod("getEvaluationSettings"),libs=es.getMethod("getLibraryCache"),models=es.getMethod("getModelCache"),valuesets=es.getMethod("getValueSetCache");
  String lib="{\"resourceType\":\"Library\",\"id\":\"lib\",\"url\":\"http://example.test/Library/lib\",\"name\":\"lib\",\"status\":\"draft\",\"content\":[{\"contentType\":\"text/cql\",\"data\":\"dHJ1ZQ==\"}]}";
  String patient="{\"resourceType\":\"Patient\",\"id\":\"p\",\"active\":true}";
  String repo="{\"resourceType\":\"Bundle\",\"type\":\"collection\",\"entry\":[{\"fullUrl\":\"http://example.test/Library/lib\",\"resource\":"+lib+"},{\"resource\":"+patient+"}]}";
  String empty="{\"resourceType\":\"Bundle\",\"type\":\"collection\",\"entry\":[]}";
  Object data=parse.invoke(parser,bc,empty),first=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));
  Object second=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo.replace("\"active\":true","\"active\":false")),data));
  check(first!=second,"Evaluation settings must be fresh");check(libs.invoke(first)==libs.invoke(second),"Same definitions should reuse compiled libraries despite changed patient");check(models.invoke(first)==models.invoke(second),"Same definitions reuse compiled models");check(valuesets.invoke(first)!=valuesets.invoke(second),"ValueSet expansion state must be fresh");
  Object changed=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo.replace("dHJ1ZQ==","ZmFsc2U=")),data));check(libs.invoke(changed)!=libs.invoke(second),"Changed CQL with same canonical/version must invalidate");
  Object returned=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));check(libs.invoke(returned)!=libs.invoke(second),"A/B/A must replace the last generation");
  Object dataKnowledge=parse.invoke(parser,bc,empty.replace("\"entry\":[]","\"entry\":[{\"resource\":"+lib+"}]"));
  Object fromData=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),dataKnowledge));check(libs.invoke(fromData)!=libs.invoke(returned),"Explicit data knowledge participates in key");
  Object external=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo.replace("\"data\":\"dHJ1ZQ==\"","\"url\":\"file:/not-loaded.cql\"")),data));
  Object externalAgain=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo.replace("\"data\":\"dHJ1ZQ==\"","\"url\":\"file:/not-loaded.cql\"")),data));check(libs.invoke(external)!=libs.invoke(externalAgain),"External content must not reuse");
  Object restored=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));
  Class<?> vid=Class.forName("org.hl7.elm.r1.VersionedIdentifier");Object id=vid.getConstructor().newInstance();vid.getMethod("setId",String.class).invoke(id,"expression");vid.getMethod("setVersion",String.class).invoke(id,"1.0.0");
  // Erased marker is never evaluated; it verifies exclusion independently of compiler implementation details.
  ((Map<Object,Object>)libs.invoke(restored)).put(id,new Object());
  Object next=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));check(!((Map<?,?>)libs.invoke(next)).containsKey(id),"Synthetic inline identifier must not seed later requests");
  Object copied=es.getConstructor(es).newInstance(next);check(libs.invoke(copied)!=libs.invoke(next),"Inline settings copy has separate library map");check(models.invoke(copied)!=models.invoke(next),"Inline settings copy has separate model map");
  Object legacy=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),null));check(libs.invoke(legacy)!=libs.invoke(next),"Legacy and strict session generations differ");
  Object beforeFailure=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));
  try{driver.getMethod("main",String[].class).invoke(null,(Object)new String[]{"/not-a-real-cache-check-file.json","x","Patient/p"});throw new AssertionError("Expected file failure");}catch(InvocationTargetException expected){check(expected.getCause() instanceof java.nio.file.NoSuchFileException,"Original input failure preserved");}
  Object afterFailure=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));check(libs.invoke(beforeFailure)!=libs.invoke(afterFailure),"Throw clears compiled generation");
  String[] knowledge={"{\"resourceType\":\"PlanDefinition\",\"id\":\"pdef\",\"status\":\"draft\",\"title\":\"A\"}","{\"resourceType\":\"ValueSet\",\"id\":\"vs\",\"status\":\"draft\",\"name\":\"A\"}","{\"resourceType\":\"Binary\",\"id\":\"binary\",\"contentType\":\"text/plain\",\"data\":\"QQ==\"}"};
  for(String k:knowledge){String r=repo.replace("\"entry\":[","\"entry\":[{\"resource\":"+k+"},");Object one=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,r),data));String changedKnowledge=r.replace("\"A\"","\"B\"").replace("QQ==","Qg==");Object two=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,changedKnowledge),data));check(libs.invoke(one)!=libs.invoke(two),"Changed generic definition/Binary invalidates");}
  Object beforeUrl=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));Object afterUrl=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo.replace("\"fullUrl\":\"http://example.test/Library/lib\"","\"fullUrl\":\"http://other.test/Library/lib\"")),data));check(libs.invoke(beforeUrl)!=libs.invoke(afterUrl),"Entry fullUrl participates in key");
  Class<?> rc=Class.forName("org.hl7.fhir.instance.model.api.IBaseResource"),params=Class.forName("org.hl7.fhir.r4.model.Parameters");Method finish=driver.getDeclaredMethod("finishCompilation",fc,rc);finish.setAccessible(true);
  Object good=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));finish.invoke(null,ctx,parse.invoke(parser,params,"{\"resourceType\":\"Parameters\"}"));Object afterGood=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));check(libs.invoke(good)==libs.invoke(afterGood),"Successful result retains compilation");
  for(String severity:new String[]{"warning","error","fatal"}){Object before=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));Object outcome=parse.invoke(parser,params,"{\"resourceType\":\"Parameters\",\"parameter\":[{\"name\":\"return\",\"resource\":{\"resourceType\":\"OperationOutcome\",\"issue\":[{\"severity\":\""+severity+"\",\"code\":\"invalid\"}]}}]}");finish.invoke(null,ctx,outcome);Object after=evaluation.invoke(settings.invoke(null,ctx,parse.invoke(parser,bc,repo),data));check((libs.invoke(before)==libs.invoke(after))==severity.equals("warning"),"Outcome severity clearing threshold: "+severity);}
  if(checks!=22)throw new AssertionError("Expected22checks, got"+checks);
  System.out.println("COMPILED_DEFINITION_CACHE_CHECKS="+checks+" PASS (no native policy evaluation)");
 }
}
